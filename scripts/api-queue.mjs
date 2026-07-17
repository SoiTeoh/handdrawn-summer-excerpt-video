import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {
  projectRoot,
  rendersRoot,
  requestFileFor,
  stdoutLogFor,
  stderrLogFor,
  saveStatus,
  readJson,
} from './api-state.mjs';

const npmCommand = () => (process.platform === 'win32' ? 'npm.cmd' : 'npm');

const publicDownloadRoot = () =>
  path.resolve(process.env.PUBLIC_DOWNLOAD_ROOT || path.join(projectRoot, 'renders', 'public-downloads'));

const publicDownloadBaseUrl = () =>
  (process.env.PUBLIC_DOWNLOAD_BASE_URL || 'http://127.0.0.1:3003/assets/handdrawn').replace(/\/+$/, '');

const maxConcurrentRenders = () => {
  const value = Number.parseInt(process.env.MAX_CONCURRENT_RENDERS || '1', 10);
  return Number.isInteger(value) && value > 0 ? value : 1;
};

const copyFileAtomic = async (source, destination) => {
  await fs.mkdir(path.dirname(destination), {recursive: true});
  const tmp = `${destination}.tmp-${process.pid}-${Date.now()}`;
  await fs.copyFile(source, tmp);
  await fs.rename(tmp, destination);
};

const runRenderCommand = async (jobId) => {
  const requestFile = requestFileFor(jobId);
  const stdoutLog = stdoutLogFor(jobId);
  const stderrLog = stderrLogFor(jobId);
  await fs.writeFile(stdoutLog, '', 'utf8');
  await fs.writeFile(stderrLog, '', 'utf8');

  const child = spawn(
    npmCommand(),
    ['run', 'render:job', '--', '--input', requestFile, '--job-id', jobId],
    {
      cwd: projectRoot,
      env: process.env,
      windowsHide: true,
    },
  );

  child.stdout?.on('data', (chunk) => {
    fs.appendFile(stdoutLog, chunk).catch(() => {});
  });
  child.stderr?.on('data', (chunk) => {
    fs.appendFile(stderrLog, chunk).catch(() => {});
  });

  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  if (code !== 0) {
    const stderr = await fs.readFile(stderrLog, 'utf8').catch(() => '');
    const shortError = stderr.trim().split(/\r?\n/).slice(-3).join(' ') || `render:job exited with code ${code}`;
    throw new Error(shortError);
  }
};

export class RenderQueue {
  constructor() {
    this.queue = [];
    this.running = 0;
    this.maxConcurrent = maxConcurrentRenders();
  }

  enqueue(jobId) {
    this.queue.push(jobId);
    this.drain();
  }

  drain() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const jobId = this.queue.shift();
      this.running += 1;
      this.process(jobId)
        .catch(() => {})
        .finally(() => {
          this.running -= 1;
          this.drain();
        });
    }
  }

  async process(jobId) {
    await saveStatus(jobId, {
      ok: true,
      status: 'running',
      startedAt: new Date().toISOString(),
    });

    try {
      await runRenderCommand(jobId);

      const resultFile = path.join(rendersRoot(), 'jobs', jobId, 'result.json');
      const result = await readJson(resultFile);
      if (!result.ok) {
        throw new Error(result.error || 'render:job failed');
      }

      const outputFile = path.join(rendersRoot(), 'jobs', jobId, 'output.mp4');
      const publicOutput = path.join(publicDownloadRoot(), jobId, 'output.mp4');
      await copyFileAtomic(outputFile, publicOutput);

      const downloadUrl = `${publicDownloadBaseUrl()}/${jobId}/output.mp4`;
      await saveStatus(jobId, {
        ok: true,
        status: 'succeeded',
        finishedAt: new Date().toISOString(),
        sceneCount: result.sceneCount,
        segmentCount: result.segmentCount,
        audioDuration: result.audioDuration,
        downloadUrl,
      });
    } catch (error) {
      await saveStatus(jobId, {
        ok: false,
        status: 'failed',
        finishedAt: new Date().toISOString(),
        error: error.message || 'Render failed',
      });
    }
  }
}
