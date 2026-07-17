import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(__dirname, '..');

const resolveProjectPath = (envName, fallback) =>
  path.resolve(projectRoot, process.env[envName] || fallback);

export const jobsRoot = () => resolveProjectPath('JOBS_ROOT', path.join(projectRoot, 'jobs'));
export const rendersRoot = () => resolveProjectPath('RENDERS_ROOT', path.join(projectRoot, 'renders'));
export const apiJobsRoot = () => path.join(jobsRoot(), 'api');

export const jobIdPattern = /^[a-zA-Z0-9-]+$/;

export const assertSafeJobId = (jobId) => {
  if (typeof jobId !== 'string' || !jobIdPattern.test(jobId) || jobId.length > 80) {
    throw new Error('Invalid jobId');
  }
};

export const jobDir = (jobId) => {
  assertSafeJobId(jobId);
  return path.join(apiJobsRoot(), jobId);
};

export const requestFileFor = (jobId) => path.join(jobDir(jobId), 'request.json');
export const statusFileFor = (jobId) => path.join(jobDir(jobId), 'status.json');
export const stdoutLogFor = (jobId) => path.join(jobDir(jobId), 'stdout.log');
export const stderrLogFor = (jobId) => path.join(jobDir(jobId), 'stderr.log');

export const writeJsonAtomic = async (file, value) => {
  await fs.mkdir(path.dirname(file), {recursive: true});
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, file);
};

export const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

export const saveStatus = async (jobId, patch) => {
  let current = {};
  try {
    current = await readJson(statusFileFor(jobId));
  } catch {
    current = {};
  }
  const next = {
    ...current,
    ...patch,
    jobId,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonAtomic(statusFileFor(jobId), next);
  return next;
};

export const loadStatus = async (jobId) => {
  assertSafeJobId(jobId);
  return readJson(statusFileFor(jobId));
};

export const markInterruptedRunningJobs = async () => {
  await fs.mkdir(apiJobsRoot(), {recursive: true});
  const entries = await fs.readdir(apiJobsRoot(), {withFileTypes: true});
  for (const entry of entries) {
    if (!entry.isDirectory() || !jobIdPattern.test(entry.name)) continue;
    const statusFile = statusFileFor(entry.name);
    try {
      const status = await readJson(statusFile);
      if (status.status === 'running') {
        await saveStatus(entry.name, {
          ok: false,
          status: 'failed',
          error: 'Render was interrupted by API restart',
        });
      }
    } catch {
      // Ignore malformed historical status files; a specific GET will surface the read error.
    }
  }
};
