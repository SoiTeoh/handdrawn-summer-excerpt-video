import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {runRenderJob} from './render-job.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const optionalPackageBinary = (packageName) => {
  try {
    return require(packageName).path;
  } catch {
    return undefined;
  }
};
const ffmpeg =
  process.env.FFMPEG_PATH ||
  optionalPackageBinary('@ffmpeg-installer/ffmpeg') ||
  'ffmpeg';

const run = (command, args) => {
  const result = spawnSync(command, args, {cwd: projectRoot, encoding: 'utf8'});
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stderr}`);
  }
};

const hasFfmpeg = () => {
  const result = spawnSync(ffmpeg, ['-version'], {encoding: 'utf8'});
  return result.status === 0;
};

const makeAudio = async (file, seconds, frequency) => {
  await fs.mkdir(path.dirname(file), {recursive: true});
  run(ffmpeg, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${frequency}:duration=${seconds}`,
    '-ac',
    '2',
    '-ar',
    '44100',
    '-b:a',
    '128k',
    file,
  ]);
};

const startServer = async (root) => {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const file = path.join(root, path.basename(url.pathname));
      const buffer = await fs.readFile(file);
      res.writeHead(200, {'content-type': 'audio/mpeg'});
      res.end(buffer);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const makeJob = (segmentCount, baseUrl, reversed = false) => {
  const segments = Array.from({length: segmentCount}, (_, index) => ({
    index,
    scene_id: `scene_${index}`,
    link: `${baseUrl}/segment-${index}.mp3`,
    duration: 0.12,
  }));
  if (reversed) segments.reverse();
  return {
    jobType: 'merge_audio_segments_and_render',
    audioMerge: {
      required: true,
      segments,
    },
    input: {
      template: 'handdrawn_reading_coloring_video',
      version: '1.0.0',
      style: 'children_coloring_page',
      book: {title: 'test'},
      video: {width: 720, height: 960, fps: 30, duration: 999},
      narration: {
        enabled: true,
        mode: 'full_track',
        audioSrc: 'audio/placeholder.mp3',
        duration: 1,
        syncMode: 'fit_audio',
        volume: 1,
        text: 'test narration',
      },
      scenes: segments.map((segment) => ({
        id: segment.scene_id,
        kind: 'content',
        visualMetaphor: 'meaning_vs_real',
        visualLabel: 'test',
        duration: 1,
        eyebrow: 'test',
        title: 'test',
        body: 'test',
        note: 'test',
        accent: 'blue',
      })),
    },
  };
};

const writeJob = async (name, job) => {
  const file = path.join(projectRoot, 'renders', 'job-tests', `${name}.json`);
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, `${JSON.stringify(job, null, 2)}\n`, 'utf8');
  return path.relative(projectRoot, file);
};

const main = async () => {
  if (!hasFfmpeg()) {
    console.log('Skipping render-job merge tests because ffmpeg is not available.');
    return;
  }

  const audioRoot = path.join(projectRoot, 'renders', 'job-tests', 'audio');
  for (let i = 0; i < 8; i += 1) {
    await makeAudio(path.join(audioRoot, `segment-${i}.mp3`), 0.12, 500 + i * 40);
  }

  const server = await startServer(audioRoot);
  try {
    for (const count of [5, 8]) {
      const jobFile = await writeJob(`job-${count}`, makeJob(count, server.baseUrl, true));
      const result = await runRenderJob([
        '--input',
        jobFile,
        '--job-id',
        `test-${count}`,
        '--skip-render',
      ]);
      assert.equal(result.ok, true);
      assert.equal(result.segmentCount, count);
      assert.match(result.audioSrc, /^audio\/jobs\/test-\d\/narration\.mp3$/);
      assert.equal(typeof result.audioDuration, 'number');

      const finalInput = JSON.parse(
        await fs.readFile(path.join(projectRoot, result.inputFile), 'utf8'),
      );
      assert.equal(typeof finalInput.narration.duration, 'number');
      assert.equal(finalInput.narration.audioSrc, result.audioSrc);
      assert.equal(Object.hasOwn(finalInput.video, 'duration'), false);
    }

    const failingJob = makeJob(5, server.baseUrl);
    failingJob.audioMerge.segments[2].link = `${server.baseUrl}/missing.mp3`;
    const failingFile = await writeJob('job-failing-download', failingJob);
    await assert.rejects(
      () =>
        runRenderJob([
          '--input',
          failingFile,
          '--job-id',
          'test-failing-download',
          '--skip-render',
        ]),
      /scene_2/,
    );
  } finally {
    await server.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
