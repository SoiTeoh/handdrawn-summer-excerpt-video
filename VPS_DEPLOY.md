# VPS Deployment

This project renders a Remotion video from a Coze `render_job_json`.

Pipeline:

```text
render_job_json
-> download TTS segments
-> merge MP3 with FFmpeg
-> read real duration with ffprobe
-> write input.final.json
-> render MP4 with Remotion
-> write result.json
```

## Oracle ARM64 Ubuntu 24.04 Notes

Oracle Cloud Ampere instances report `aarch64` / `arm64`. This is supported.

- NodeSource Node.js 22 supports Linux ARM64.
- System `ffmpeg` / `ffprobe` from `apt` are recommended on ARM64.
- The npm fallback packages also include `linux-arm64`, but production should prefer `/usr/bin/ffmpeg` and `/usr/bin/ffprobe`.
- Ubuntu 24.04 often installs Chromium through Snap. In that case use `REMOTION_BROWSER_EXECUTABLE=/snap/bin/chromium`.
- If Chromium is installed as a deb package, use `REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium`.

## 1. Install System Packages

Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y curl ca-certificates git ffmpeg chromium fonts-noto-cjk fontconfig
```

Install Node.js 22:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

If your distribution package is named `chromium-browser`, install that instead:

```bash
sudo apt install -y chromium-browser
```

On Ubuntu 24.04 ARM64, verify the Chromium path:

```bash
command -v chromium || command -v chromium-browser || command -v google-chrome || command -v /snap/bin/chromium
```

## 2. Clone And Install

```bash
git clone https://github.com/SoiTeoh/handdrawn-summer-excerpt-video.git
cd handdrawn-summer-excerpt-video
npm install
```

## 3. Configure Environment

Create `.env` from `.env.example` if your deployment tooling loads env files:

```bash
cp .env.example .env
```

For shell usage, export the variables directly:

```bash
export FFMPEG_PATH=/usr/bin/ffmpeg
export FFPROBE_PATH=/usr/bin/ffprobe
export REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium
export JOBS_ROOT=./jobs
export RENDERS_ROOT=./renders
export PUBLIC_AUDIO_ROOT=./public/audio
```

For Ubuntu 24.04 Snap Chromium, use:

```bash
export REMOTION_BROWSER_EXECUTABLE=/snap/bin/chromium
```

`PUBLIC_AUDIO_ROOT` must stay inside `./public`, because Remotion reads audio through `staticFile("audio/...")`.

## 4. Check The Server

```bash
npm run check:environment
```

The check validates:

- Node.js
- npm
- FFmpeg
- ffprobe
- Chrome/Chromium
- Chinese fonts
- `public/audio` write access
- `renders` write access

Any failure exits with a non-zero code.

## 5. Run A Render Job

Put a real Coze render job JSON under `jobs/`, for example:

```text
jobs/render-job-coze-v3-test.json
```

Run:

```bash
npm run render:job -- --input jobs/render-job-coze-v3-test.json --job-id coze-v3-test
```

Expected outputs:

```text
public/audio/jobs/coze-v3-test/
  segment-000.mp3
  segment-001.mp3
  narration.mp3
  concat.txt

renders/jobs/coze-v3-test/
  input.final.json
  output.mp4
  result.json
```

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `FFMPEG_PATH` | Absolute path to `ffmpeg`. If omitted, system `ffmpeg` is tried, then npm fallback. |
| `FFPROBE_PATH` | Absolute path to `ffprobe`. If omitted, system `ffprobe` is tried, then npm fallback. |
| `REMOTION_BROWSER_EXECUTABLE` | Absolute path to Chrome/Chromium for Remotion. |
| `JOBS_ROOT` | Root directory for job JSON files. Defaults to `./jobs`. |
| `RENDERS_ROOT` | Root directory for render outputs. Defaults to `./renders`. |
| `PUBLIC_AUDIO_ROOT` | Root directory for generated public audio. Defaults to `./public/audio`. |
| `HANDDRAWN_API_HOST` | Internal API listen host. Recommended: `127.0.0.1`. |
| `HANDDRAWN_API_PORT` | Internal API listen port. Recommended: `3003`. |
| `HANDDRAWN_API_TOKEN` | Bearer token required by `/jobs` endpoints. Use a long random value. |
| `PUBLIC_DOWNLOAD_ROOT` | Directory where completed MP4 files are copied for Nginx static serving. |
| `PUBLIC_DOWNLOAD_BASE_URL` | Public URL prefix for copied MP4 files. |
| `MAX_CONCURRENT_RENDERS` | Render worker concurrency. Keep `1` for the validated VPS baseline. |

## Async HTTP API

The API is intended to run behind Nginx:

```text
/handdrawn-api/ -> http://127.0.0.1:3003/
```

Start locally on the VPS shell:

```bash
export HANDDRAWN_API_HOST=127.0.0.1
export HANDDRAWN_API_PORT=3003
export HANDDRAWN_API_TOKEN=replace-with-a-long-random-token
export PUBLIC_DOWNLOAD_ROOT=/var/www/shudan-assets/handdrawn
export PUBLIC_DOWNLOAD_BASE_URL=http://129.146.22.243:80/assets/handdrawn
export MAX_CONCURRENT_RENDERS=1
npm run api:start
```

PM2 configuration is provided in `ecosystem.config.cjs`:

```bash
pm2 start ecosystem.config.cjs
pm2 logs handdrawn-render-api
```

Health check:

```bash
curl http://127.0.0.1:3003/health
```

Submit a Coze render job:

```bash
curl -X POST http://127.0.0.1:3003/jobs \
  -H "Authorization: Bearer $HANDDRAWN_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @jobs/render-job-vps-test.json
```

Query status:

```bash
curl http://127.0.0.1:3003/jobs/<jobId> \
  -H "Authorization: Bearer $HANDDRAWN_API_TOKEN"
```

API state and logs:

```text
jobs/api/<jobId>/request.json
jobs/api/<jobId>/status.json
jobs/api/<jobId>/stdout.log
jobs/api/<jobId>/stderr.log
```

Completed public video copy:

```text
/var/www/shudan-assets/handdrawn/<jobId>/output.mp4
```

Ensure Nginx serves `/assets/handdrawn/` with directory listing disabled.

## Logging And Failures

`render:job` prints progress to stdout/stderr and writes:

```text
renders/jobs/<jobId>/result.json
```

Failure result shape:

```json
{
  "ok": false,
  "jobId": "coze-v3-test",
  "stage": "download",
  "error": "clear error message"
}
```

Stages:

- `validate`
- `download`
- `merge`
- `probe`
- `input`
- `render`

## Notes

- Do not commit `node_modules/`, `renders/`, or `public/audio/`.
- The real Coze job may contain signed TTS URLs. Keep those private.
- The HTTP API is an asynchronous local wrapper only. It does not include a database, distributed queue, or web UI.
- The visual template is the V3 local stable baseline; this deployment guide does not change scene timing, audio merge order, or `fit_audio` logic.
