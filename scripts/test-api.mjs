import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const findFreePort = async () => {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const {port} = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
};

const writeJson = async (file, value) => {
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const startApi = async ({port, token, jobsRoot, rendersRoot, publicRoot}) => {
  const child = spawn(process.execPath, ['scripts/render-api.mjs'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HANDDRAWN_API_HOST: '127.0.0.1',
      HANDDRAWN_API_PORT: String(port),
      HANDDRAWN_API_TOKEN: token,
      JOBS_ROOT: jobsRoot,
      RENDERS_ROOT: rendersRoot,
      PUBLIC_DOWNLOAD_ROOT: publicRoot,
      PUBLIC_DOWNLOAD_BASE_URL: 'http://127.0.0.1/assets/handdrawn',
      MAX_CONCURRENT_RENDERS: '1',
    },
    windowsHide: true,
  });

  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return {child, baseUrl};
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  child.kill();
  throw new Error(`API did not start. ${stderr}`);
};

const stopApi = async (child) => {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => child.once('exit', resolve));
};

const postJson = (baseUrl, pathName, body, token) =>
  fetch(`${baseUrl}${pathName}`, {
    method: 'POST',
    headers: {
      ...(token ? {authorization: `Bearer ${token}`} : {}),
      'content-type': 'application/json',
    },
    body,
  });

const validJob = {
  jobType: 'merge_audio_segments_and_render',
  audioMerge: {
    required: true,
    segments: [
      {
        index: 0,
        scene_id: 'scene_0',
        link: 'https://example.com/segment-0.mp3',
      },
    ],
  },
  input: {
    template: 'handdrawn_reading_coloring_video',
    video: {width: 720, height: 960, fps: 30},
    narration: {
      enabled: true,
      mode: 'full_track',
      audioSrc: 'audio/placeholder.mp3',
      duration: 1,
      syncMode: 'fit_audio',
    },
    scenes: [{id: 'scene_0', title: 'test'}],
  },
};

const main = async () => {
  const tempRoot = path.join(projectRoot, 'renders', 'api-tests', String(Date.now()));
  const jobsRoot = path.join(tempRoot, 'jobs');
  const rendersRoot = path.join(tempRoot, 'renders');
  const publicRoot = path.join(tempRoot, 'public');
  const token = 'test-token';

  await writeJson(path.join(jobsRoot, 'api', 'status-ok', 'status.json'), {
    ok: true,
    jobId: 'status-ok',
    status: 'succeeded',
    sceneCount: 6,
    segmentCount: 6,
    audioDuration: 65.045,
    downloadUrl: 'http://127.0.0.1/assets/handdrawn/status-ok/output.mp4',
  });
  await writeJson(path.join(jobsRoot, 'api', 'status-running', 'status.json'), {
    ok: true,
    jobId: 'status-running',
    status: 'running',
  });

  const port = await findFreePort();
  const {child, baseUrl} = await startApi({port, token, jobsRoot, rendersRoot, publicRoot});

  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {ok: true, service: 'handdrawn-render-api'});

    const unauthorized = await postJson(baseUrl, '/jobs', '{}');
    assert.equal(unauthorized.status, 401);

    const invalidJson = await postJson(baseUrl, '/jobs', '{"broken"', token);
    assert.equal(invalidJson.status, 400);

    const traversalJob = structuredClone(validJob);
    traversalJob.input.narration.audioSrc = '../secret.mp3';
    const traversal = await postJson(baseUrl, '/jobs', JSON.stringify(traversalJob), token);
    assert.equal(traversal.status, 400);
    assert.match((await traversal.json()).error, /Unsafe local path/);

    const status = await fetch(`${baseUrl}/jobs/status-ok`, {
      headers: {authorization: `Bearer ${token}`},
    });
    assert.equal(status.status, 200);
    const statusJson = await status.json();
    assert.equal(statusJson.status, 'succeeded');
    assert.equal(statusJson.sceneCount, 6);
    assert.equal(statusJson.segmentCount, 6);
    assert.equal(statusJson.audioDuration, 65.045);

    const interrupted = await fetch(`${baseUrl}/jobs/status-running`, {
      headers: {authorization: `Bearer ${token}`},
    });
    assert.equal(interrupted.status, 200);
    const interruptedJson = await interrupted.json();
    assert.equal(interruptedJson.status, 'failed');
    assert.match(interruptedJson.error, /interrupted/i);
  } finally {
    await stopApi(child);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
