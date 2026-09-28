const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Cloudflare configuration uses the shared Worker, static assets and Hyperdrive', () => {
  const config = read('wrangler.jsonc');
  const worker = read('cloudflare/worker.mjs');
  const headers = read('frontend/_headers');

  assert.match(config, /"main"\s*:\s*"cloudflare\/worker\.mjs"/);
  assert.match(config, /"compatibility_date"\s*:\s*"2026-09-28"/);
  assert.match(config, /"directory"\s*:\s*"\.\/frontend"/);
  assert.match(config, /"binding"\s*:\s*"ASSETS"/);
  assert.match(config, /"run_worker_first"\s*:\s*\[[\s\S]*"\/api\/\*"/);
  assert.match(config, /"binding"\s*:\s*"HYPERDRIVE"/);
  const hyperdriveId = config.match(/"binding"\s*:\s*"HYPERDRIVE"[\s\S]*?"id"\s*:\s*"([^"]+)"/);
  assert.ok(hyperdriveId, 'Hyperdrive binding must include an ID');
  assert.match(hyperdriveId[1], /^[a-f0-9]{32}$/i);
  assert.notEqual(hyperdriveId[1], '00000000000000000000000000000000');
  assert.doesNotMatch(config, /postgres(?:ql)?:\/\//i);
  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /X-Frame-Options:\s*DENY/);
  assert.match(headers, /X-Robots-Tag:\s*noindex/);

  assert.match(worker, /from ['"]\.\.\/backend\/app\.js['"]/);
  assert.match(worker, /from ['"]\.\.\/backend\/config\/database\.js['"]/);
  assert.match(worker, /httpServerHandler/);
  assert.match(worker, /database\.configureWorker/);
  assert.match(worker, /env\.ASSETS\.fetch/);
  assert.doesNotMatch(worker, /DATABASE_URL\s*=/);
});

test('Cloudflare app mode does not try to serve the Node filesystem', () => {
  const script = [
    "process.env.SAPLE_RUNTIME='cloudflare';",
    "const app=require('./app');",
    "const server=app.listen(0,'127.0.0.1',async()=>{",
    "const port=server.address().port;",
    "const api=await fetch('http://127.0.0.1:'+port+'/api/health');",
    "const page=await fetch('http://127.0.0.1:'+port+'/index.html');",
    "console.log(api.status+' '+page.status+' '+(await api.json()).message);",
    "server.close();});"
  ].join('');
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: path.join(root, 'backend'),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /200 404 Saple API is running/);
});

test('Cloudflare runtime marker is additive to Render hosting detection', () => {
  const hosting = require('../config/hosting');
  const oldRuntime = process.env.SAPLE_RUNTIME;
  const oldRender = process.env.RENDER;
  try {
    process.env.SAPLE_RUNTIME = 'cloudflare';
    delete process.env.RENDER;
    assert.equal(hosting.isCloudflareEnvironment(), true);
    assert.equal(hosting.isHostedEnvironment(), true);
    process.env.RENDER = 'true';
    assert.equal(hosting.isRenderEnvironment(), true);
  } finally {
    if (oldRuntime === undefined) delete process.env.SAPLE_RUNTIME;
    else process.env.SAPLE_RUNTIME = oldRuntime;
    if (oldRender === undefined) delete process.env.RENDER;
    else process.env.RENDER = oldRender;
  }
});

test('Worker database mode is explicitly separate from the local fallback', () => {
  const source = read('backend/config/database.js');
  assert.match(source, /function configureWorker/);
  assert.match(source, /new Client\(\{ connectionString: workerConnectionString \}\)/);
  assert.match(source, /if \(workerMode\) return workerQuery/);
  assert.match(source, /DB_FALLBACK_ENABLED/);
});
