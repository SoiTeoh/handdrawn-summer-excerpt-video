import {createWriteStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

class StageError extends Error {
  constructor(stage, message, details = {}) {
    super(message);
    this.name = 'StageError';
    this.stage = stage;
    this.details = details;
  }
}

const parseArgs = (argv) => {
  const args = {
    composition: 'SummerExcerptColoringVideo',
    skipRender: false,
    cleanup: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') args.input = argv[++i];
    else if (arg === '--job-id') args.jobId = argv[++i];
    else if (arg === '--composition') args.composition = argv[++i];
    else if (arg === '--output') args.output = argv[++i];
    else if (arg === '--skip-render') args.skipRender = true;
    else if (arg === '--cleanup') args.cleanup = true;
    else throw new StageError('validate', `Unknown argument: ${arg}`);
  }
  if (!args.input) {
    throw new StageError(
      'validate',
      'Missing --input. Example: npm run render:job -- --input ./jobs/example-render-job.json',
    );
  }
  return args;
};

const timestampJobId = () => {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${suffix}`;
};

const readJson = async (file) => {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw);
};

const writeJsonAtomic = async (file, value) => {
  await fs.mkdir(path.dirname(file), {recursive: true});
  const tmp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, file);
};

const assertObject = (value, label, stage = 'validate') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StageError(stage, `${label} must be an object`);
  }
};

const validateInput = (input) => {
  assertObject(input, 'input');
  if (input.template !== 'handdrawn_reading_coloring_video') {
    throw new StageError('validate', 'input.template must be handdrawn_reading_coloring_video');
  }
  if (!Array.isArray(input.scenes) || input.scenes.length < 1) {
    throw new StageError('validate', 'input.scenes must be a non-empty array');
  }
  if (!input.video || typeof input.video.width !== 'number' || typeof input.video.height !== 'number' || typeof input.video.fps !== 'number') {
    throw new StageError('validate', 'input.video must include numeric width, height, and fps');
  }
};

const validateJob = (job) => {
  assertObject(job, 'render job');
  if (job.jobType && job.jobType !== 'merge_audio_segments_and_render') {
    throw new StageError('validate', `Unsupported jobType: ${job.jobType}`);
  }
  validateInput(job.input);

  const merge = job.audioMerge;
  const required = merge?.required === true;
  if (!required) return {required: false, segments: []};

  assertObject(merge, 'audioMerge');
  if (!Array.isArray(merge.segments) || merge.segments.length < 1) {
    throw new StageError('validate', 'audioMerge.segments must be a non-empty array when audioMerge.required=true');
  }

  const seen = new Set();
  const segments = merge.segments.map((segment, arrayPosition) => {
    assertObject(segment, `audioMerge.segments[${arrayPosition}]`);
    if (!Number.isInteger(segment.index) || segment.index < 0) {
      throw new StageError('validate', `Segment at array position ${arrayPosition} has invalid index`);
    }
    if (seen.has(segment.index)) {
      throw new StageError('validate', `Duplicate segment index: ${segment.index}`);
    }
    seen.add(segment.index);
    let url;
    try {
      url = new URL(segment.link);
    } catch {
      throw new StageError('validate', `Segment ${segment.index} has invalid URL`, {
        index: segment.index,
        scene_id: segment.scene_id,
        url: segment.link,
      });
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new StageError('validate', `Segment ${segment.index} URL must be http or https`, {
        index: segment.index,
        scene_id: segment.scene_id,
        url: segment.link,
      });
    }
    return {...segment, link: url.toString()};
  });

  segments.sort((a, b) => a.index - b.index);
  return {required: true, segments};
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const downloadSegment = async (segment, outputFile, retries = 3, timeoutMs = 30000) => {
  const tmpFile = `${outputFile}.tmp-${process.pid}`;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(segment.link, {signal: controller.signal});
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      await fs.mkdir(path.dirname(outputFile), {recursive: true});
      const stream = createWriteStream(tmpFile);
      await new Promise((resolve, reject) => {
        response.body.pipeTo(
          new WritableStream({
            write(chunk) {
              return new Promise((done, fail) => {
                stream.write(Buffer.from(chunk), (error) => (error ? fail(error) : done()));
              });
            },
            close() {
              stream.end(resolve);
            },
            abort(error) {
              stream.destroy(error);
              reject(error);
            },
          }),
        ).catch(reject);
      });
      const stat = await fs.stat(tmpFile);
      if (stat.size <= 0) {
        throw new Error('Downloaded file is empty');
      }
      await fs.rename(tmpFile, outputFile);
      return;
    } catch (error) {
      await fs.rm(tmpFile, {force: true}).catch(() => {});
      if (attempt === retries) {
        throw new StageError(
          'download',
          `Failed to download segment ${segment.index} (${segment.scene_id ?? 'unknown scene'}): ${error.message}`,
          {index: segment.index, scene_id: segment.scene_id, url: segment.link},
        );
      }
      await sleep(500 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
};

const quoteConcatPath = (file) => file.replace(/\\/g, '/').replace(/'/g, "'\\''");

const runCommand = async (stage, command, args) => {
  const printable = [command, ...args].map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(' ');
  const isWindowsCommand = process.platform === 'win32' && /\.cmd$/i.test(command);
  const spawnCommand = isWindowsCommand ? 'cmd.exe' : command;
  const spawnArgs = isWindowsCommand ? ['/d', '/s', '/c', command, ...args] : args;
  let child;
  try {
    child = spawn(spawnCommand, spawnArgs, {
      cwd: projectRoot,
      env: process.env,
      windowsHide: true,
    });
  } catch (error) {
    throw new StageError(stage, `Failed to start command: ${printable}. ${error.message}`, {
      command: printable,
    });
  }
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => {
    stdout += chunk.toString();
    process.stdout.write(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
    process.stderr.write(chunk);
  });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  }).catch((error) => {
    throw new StageError(stage, `Failed to start command: ${printable}. ${error.message}`, {
      command: printable,
    });
  });
  if (code !== 0) {
    throw new StageError(stage, `Command failed with exit code ${code}: ${printable}\n${stderr}`, {
      command: printable,
      stdout,
      stderr,
    });
  }
  return {stdout, stderr, command: printable};
};

const optionalPackageBinary = (packageName) => {
  try {
    return require(packageName).path;
  } catch {
    return undefined;
  }
};

const ffmpegPath = () =>
  process.env.FFMPEG_PATH ||
  optionalPackageBinary('@ffmpeg-installer/ffmpeg') ||
  'ffmpeg';
const ffprobePath = () =>
  process.env.FFPROBE_PATH ||
  optionalPackageBinary('@ffprobe-installer/ffprobe') ||
  'ffprobe';

const mergeAudio = async (segmentFiles, concatFile, outputFile) => {
  const concatText = segmentFiles
    .map((file) => `file '${quoteConcatPath(path.resolve(file))}'`)
    .join('\n');
  await fs.writeFile(concatFile, `${concatText}\n`, 'utf8');
  await runCommand('merge', ffmpegPath(), [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatFile,
    '-vn',
    '-ac',
    '2',
    '-ar',
    '44100',
    '-b:a',
    '192k',
    outputFile,
  ]);
};

const probeDuration = async (audioFile) => {
  const {stdout} = await runCommand('probe', ffprobePath(), [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    audioFile,
  ]);
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new StageError('probe', `ffprobe returned invalid duration: ${stdout.trim()}`);
  }
  return Number(duration.toFixed(3));
};

const publicRelativePath = (file) => {
  const relative = path.relative(path.join(projectRoot, 'public'), file);
  return relative.split(path.sep).join('/');
};

const remotionBin = () => {
  const extension = process.platform === 'win32' ? '.cmd' : '';
  return path.join(projectRoot, 'node_modules', '.bin', `remotion${extension}`);
};

const renderVideo = async ({composition, inputFile, outputFile}) => {
  const args = [
    'render',
    'src/index.ts',
    composition,
    outputFile,
    '--overwrite',
    '--bundle-cache=false',
    '--props',
    inputFile,
  ];
  if (process.env.REMOTION_BROWSER_EXECUTABLE) {
    args.push('--browser-executable', process.env.REMOTION_BROWSER_EXECUTABLE);
  }
  await runCommand('render', remotionBin(), args);
};

const resolveExistingAudioDuration = async (input) => {
  const audioSrc = input.narration?.audioSrc;
  if (!audioSrc || /^https?:\/\//i.test(audioSrc) || audioSrc.startsWith('data:')) {
    return undefined;
  }
  const audioFile = path.join(projectRoot, 'public', audioSrc);
  try {
    await fs.access(audioFile);
  } catch {
    return undefined;
  }
  return probeDuration(audioFile);
};

export const runRenderJob = async (rawArgs) => {
  const args = parseArgs(rawArgs);
  const inputPath = path.resolve(projectRoot, args.input);
  const job = await readJson(inputPath);
  const mergeInfo = validateJob(job);
  const jobId = args.jobId || job.jobId || timestampJobId();
  const audioDir = path.join(projectRoot, 'public', 'audio', 'jobs', jobId);
  const renderDir = path.join(projectRoot, 'renders', 'jobs', jobId);
  const outputFile = path.resolve(projectRoot, args.output || path.join(renderDir, 'output.mp4'));
  const inputFinalFile = path.join(renderDir, 'input.final.json');
  const resultFile = path.join(renderDir, 'result.json');
  await fs.mkdir(audioDir, {recursive: true});
  await fs.mkdir(renderDir, {recursive: true});

  const resultBase = {
    jobId,
    sceneCount: job.input.scenes.length,
    segmentCount: mergeInfo.segments.length,
  };

  try {
    const finalInput = structuredClone(job.input);
    if (finalInput.video && Object.prototype.hasOwnProperty.call(finalInput.video, 'duration')) {
      delete finalInput.video.duration;
    }

    let audioFile;
    let audioSrc = finalInput.narration?.audioSrc;
    let audioDuration;

    if (mergeInfo.required) {
      const segmentFiles = mergeInfo.segments.map((segment) =>
        path.join(audioDir, `segment-${String(segment.index).padStart(3, '0')}.mp3`),
      );
      await Promise.all(
        mergeInfo.segments.map((segment, position) =>
          downloadSegment(segment, segmentFiles[position]),
        ),
      );

      audioFile = path.join(audioDir, 'narration.mp3');
      await mergeAudio(segmentFiles, path.join(audioDir, 'concat.txt'), audioFile);
      audioDuration = await probeDuration(audioFile);
      audioSrc = publicRelativePath(audioFile);
    } else {
      audioDuration = await resolveExistingAudioDuration(finalInput);
    }

    finalInput.narration = {
      ...(finalInput.narration ?? {}),
      enabled: true,
      mode: 'full_track',
      audioSrc,
      duration:
        typeof audioDuration === 'number'
          ? audioDuration
          : finalInput.narration?.duration,
      syncMode: 'fit_audio',
      volume: 1,
      text: finalInput.narration?.text ?? '',
    };

    if (typeof finalInput.narration.duration !== 'number') {
      throw new StageError('json', 'Final narration.duration must be a number');
    }
    if (!finalInput.narration.audioSrc) {
      throw new StageError('json', 'Final narration.audioSrc is required');
    }

    await writeJsonAtomic(inputFinalFile, finalInput);

    if (!args.skipRender) {
      await renderVideo({
        composition: args.composition,
        inputFile: inputFinalFile,
        outputFile,
      });
    }

    if (args.cleanup) {
      await Promise.all(
        mergeInfo.segments.map((segment) =>
          fs.rm(path.join(audioDir, `segment-${String(segment.index).padStart(3, '0')}.mp3`), {force: true}),
        ),
      );
    }

    const result = {
      ok: true,
      ...resultBase,
      audioFile: audioFile ? path.relative(projectRoot, audioFile).split(path.sep).join('/') : undefined,
      audioSrc: finalInput.narration.audioSrc,
      audioDuration: finalInput.narration.duration,
      inputFile: path.relative(projectRoot, inputFinalFile).split(path.sep).join('/'),
      videoFile: args.skipRender
        ? undefined
        : path.relative(projectRoot, outputFile).split(path.sep).join('/'),
    };
    await writeJsonAtomic(resultFile, result);
    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    const result = {
      ok: false,
      ...resultBase,
      stage: error instanceof StageError ? error.stage : 'unknown',
      error: error.message,
      details: error instanceof StageError ? error.details : undefined,
    };
    await writeJsonAtomic(resultFile, result);
    throw error;
  }
};

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  runRenderJob(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof StageError ? error.message : error);
    process.exit(1);
  });
}
