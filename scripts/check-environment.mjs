import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const defaultPublicRoot = path.join(projectRoot, 'public');
const failures = [];
const warnings = [];

const resolveRoot = (envName, fallback) =>
  path.resolve(projectRoot, process.env[envName] || fallback);

const optionalPackageBinary = (packageName) => {
  try {
    return require(packageName).path;
  } catch {
    return undefined;
  }
};

const commandName = (name) => (process.platform === 'win32' ? `${name}.exe` : name);

const commandCandidates = (envName, command, packageName) => {
  const candidates = [];
  if (process.env[envName]) candidates.push(process.env[envName]);
  candidates.push(commandName(command));
  const packaged = optionalPackageBinary(packageName);
  if (packaged) candidates.push(packaged);
  return [...new Set(candidates)];
};

const run = (command, args = []) =>
  spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
  });

const firstWorking = (label, candidates, args) => {
  for (const candidate of candidates) {
    const result = run(candidate, args);
    if (result.status === 0) {
      console.log(`[ok] ${label}: ${candidate}`);
      const firstLine = (result.stdout || result.stderr).trim().split(/\r?\n/)[0];
      if (firstLine) console.log(`     ${firstLine}`);
      return candidate;
    }
  }
  failures.push(`${label} not found or not executable. Tried: ${candidates.join(', ')}`);
  return undefined;
};

const checkNode = () => {
  const version = process.versions.node;
  const major = Number(version.split('.')[0]);
  if (major < 20) {
    failures.push(`Node.js ${version} is too old. Use Node.js 20+; Node.js 22 is recommended.`);
  } else {
    console.log(`[ok] Node.js: ${version}`);
  }
};

const checkNpm = () => {
  const userAgent = process.env.npm_config_user_agent;
  const npmVersion = userAgent?.match(/npm\/([^\s]+)/)?.[1];
  if (npmVersion) {
    console.log(`[ok] npm: ${npmVersion}`);
    return;
  }
  const result = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version']);
  if (result.status !== 0) {
    failures.push('npm not found or not executable');
    return;
  }
  console.log(`[ok] npm: ${result.stdout.trim()}`);
};

const checkChrome = () => {
  const candidates = [];
  if (process.env.REMOTION_BROWSER_EXECUTABLE) {
    candidates.push(process.env.REMOTION_BROWSER_EXECUTABLE);
  }
  if (process.platform === 'win32') {
    candidates.push(
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    );
  } else {
    candidates.push(
      'chromium',
      'chromium-browser',
      'google-chrome',
      'google-chrome-stable',
      '/snap/bin/chromium',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
    );
  }
  for (const candidate of [...new Set(candidates.filter(Boolean))]) {
    if (path.isAbsolute(candidate) && existsSync(candidate)) {
      console.log(`[ok] Chrome/Chromium: ${candidate}`);
      return;
    }
    const result = run(candidate, ['--version']);
    if (result.status === 0) {
      console.log(`[ok] Chrome/Chromium: ${candidate}`);
      const firstLine = (result.stdout || result.stderr).trim().split(/\r?\n/)[0];
      if (firstLine) console.log(`     ${firstLine}`);
      return;
    }
  }
  failures.push(`Chrome/Chromium not found or not executable. Tried: ${[...new Set(candidates.filter(Boolean))].join(', ')}`);
};

const checkFonts = () => {
  if (process.platform === 'win32') {
    const fontCandidates = [
      'C:\\Windows\\Fonts\\msyh.ttc',
      'C:\\Windows\\Fonts\\simhei.ttf',
      'C:\\Windows\\Fonts\\simsun.ttc',
    ];
    const found = fontCandidates.some((font) => existsSync(font));
    if (found) console.log('[ok] Chinese fonts: Windows CJK font found');
    else failures.push('Chinese fonts not found in C:\\Windows\\Fonts');
    return;
  }

  const fcMatch = run('fc-match', ['Noto Sans CJK SC']);
  if (fcMatch.status === 0 && fcMatch.stdout.trim()) {
    console.log(`[ok] Chinese fonts: ${fcMatch.stdout.trim().split(/\r?\n/)[0]}`);
    return;
  }
  warnings.push('fc-match did not find Noto Sans CJK SC; install fonts-noto-cjk.');
  failures.push('Chinese font check failed');
};

const checkWritableDir = async (label, dir) => {
  try {
    await fs.mkdir(dir, {recursive: true});
    const testFile = path.join(dir, `.write-test-${process.pid}`);
    await fs.writeFile(testFile, 'ok', 'utf8');
    await fs.rm(testFile, {force: true});
    console.log(`[ok] ${label} writable: ${dir}`);
  } catch (error) {
    failures.push(`${label} is not writable: ${dir}. ${error.message}`);
  }
};

const checkPublicAudioRoot = async () => {
  const publicAudioRoot = resolveRoot('PUBLIC_AUDIO_ROOT', path.join('public', 'audio'));
  const relative = path.relative(defaultPublicRoot, publicAudioRoot);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    failures.push(
      `PUBLIC_AUDIO_ROOT must be inside ${defaultPublicRoot} so Remotion can read audio files. Current: ${publicAudioRoot}`,
    );
  }
  await checkWritableDir('public/audio', publicAudioRoot);
};

const main = async () => {
  console.log(`Project root: ${projectRoot}`);
  checkNode();
  checkNpm();
  firstWorking(
    'ffmpeg',
    commandCandidates('FFMPEG_PATH', 'ffmpeg', '@ffmpeg-installer/ffmpeg'),
    ['-version'],
  );
  firstWorking(
    'ffprobe',
    commandCandidates('FFPROBE_PATH', 'ffprobe', '@ffprobe-installer/ffprobe'),
    ['-version'],
  );
  checkChrome();
  checkFonts();
  await checkPublicAudioRoot();
  await checkWritableDir('renders', resolveRoot('RENDERS_ROOT', 'renders'));

  for (const warning of warnings) {
    console.warn(`[warn] ${warning}`);
  }

  if (failures.length > 0) {
    console.error('\nEnvironment check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('\nEnvironment check passed.');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
