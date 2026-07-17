import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {
  markInterruptedRunningJobs,
  requestFileFor,
  saveStatus,
  loadStatus,
  writeJsonAtomic,
  assertSafeJobId,
} from './api-state.mjs';
import {validateRenderJobRequest} from './api-validation.mjs';
import {RenderQueue} from './api-queue.mjs';

const serviceName = 'handdrawn-render-api';
const maxBodyBytes = 2 * 1024 * 1024;

const host = process.env.HANDDRAWN_API_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.HANDDRAWN_API_PORT || '3003', 10);
const token = process.env.HANDDRAWN_API_TOKEN || '';
const queue = new RenderQueue();
let shuttingDown = false;

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(`${JSON.stringify(payload)}\n`);
};

const requireAuth = (req, res) => {
  if (!token) {
    sendJson(res, 503, {ok: false, error: 'HANDDRAWN_API_TOKEN is not configured'});
    return false;
  }
  const header = req.headers.authorization || '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix) || header.slice(prefix.length) !== token) {
    sendJson(res, 401, {ok: false, error: 'Unauthorized'});
    return false;
  }
  return true;
};

const readRequestBody = async (req) => {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      throw new Error('Request body exceeds 2MB limit');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

const createJobId = () => {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomBytes(5).toString('hex');
  return `api-${stamp}-${suffix}`;
};

const publicStatus = (status) => {
  const payload = {
    ok: status.ok !== false,
    jobId: status.jobId,
    status: status.status,
  };
  for (const key of ['sceneCount', 'segmentCount', 'audioDuration', 'downloadUrl', 'error']) {
    if (status[key] !== undefined) payload[key] = status[key];
  }
  return payload;
};

const handleCreateJob = async (req, res) => {
  if (shuttingDown) {
    sendJson(res, 503, {ok: false, error: 'Server is shutting down'});
    return;
  }

  if (!requireAuth(req, res)) return;

  let body;
  try {
    body = await readRequestBody(req);
  } catch (error) {
    sendJson(res, 413, {ok: false, error: error.message});
    return;
  }

  let job;
  try {
    job = JSON.parse(body);
  } catch {
    sendJson(res, 400, {ok: false, error: 'Invalid JSON'});
    return;
  }

  let counts;
  try {
    counts = validateRenderJobRequest(job);
  } catch (error) {
    sendJson(res, 400, {ok: false, error: error.message});
    return;
  }

  const jobId = createJobId();
  const now = new Date().toISOString();
  await writeJsonAtomic(requestFileFor(jobId), job);
  const status = await saveStatus(jobId, {
    ok: true,
    status: 'queued',
    createdAt: now,
    sceneCount: counts.sceneCount,
    segmentCount: counts.segmentCount,
  });
  queue.enqueue(jobId);
  sendJson(res, 202, publicStatus(status));
};

const handleGetJob = async (req, res, jobId) => {
  if (!requireAuth(req, res)) return;

  try {
    assertSafeJobId(jobId);
  } catch {
    sendJson(res, 400, {ok: false, error: 'Invalid jobId'});
    return;
  }

  try {
    const status = await loadStatus(jobId);
    sendJson(res, 200, publicStatus(status));
  } catch {
    sendJson(res, 404, {ok: false, error: 'Job not found'});
  }
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {ok: true, service: serviceName});
      return;
    }
    if (req.method === 'POST' && url.pathname === '/jobs') {
      await handleCreateJob(req, res);
      return;
    }
    const jobMatch = url.pathname.match(/^\/jobs\/([a-zA-Z0-9-]+)$/);
    if (req.method === 'GET' && jobMatch) {
      await handleGetJob(req, res, jobMatch[1]);
      return;
    }
    sendJson(res, 404, {ok: false, error: 'Not found'});
  } catch {
    sendJson(res, 500, {ok: false, error: 'Internal server error'});
  }
});

await markInterruptedRunningJobs();

server.listen(port, host, () => {
  console.log(`${serviceName} listening on http://${host}:${port}`);
});

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${serviceName} received ${signal}, closing HTTP server`);
  await new Promise((resolve) => {
    server.close((error) => {
      if (error) console.error(`${serviceName} shutdown error: ${error.message}`);
      resolve();
    });
  });
  console.log(`${serviceName} HTTP server closed`);
};

process.on('SIGINT', () => {
  shutdown('SIGINT').catch((error) => {
    console.error(`${serviceName} shutdown error: ${error.message}`);
  });
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch((error) => {
    console.error(`${serviceName} shutdown error: ${error.message}`);
  });
});
