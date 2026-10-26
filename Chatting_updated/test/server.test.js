const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const SERVER = path.join(__dirname, '..', 'server.js');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHealth(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return res.json();
    } catch {
      // Server not listening yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not become healthy in time');
}

test('server boots and answers /health without crashing', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptr29-server-'));
  const port = await freePort();

  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      DATA_DIR: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (d) => { output += d.toString(); });
  child.stderr.on('data', (d) => { output += d.toString(); });

  t.after(() => {
    try { child.kill(); } catch {}
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const health = await waitForHealth(port);
  assert.strictEqual(health.status, 'ok');

  // Give the process a moment: a crash after startup would show up here.
  assert.strictEqual(child.exitCode, null, `server exited early:\n${output}`);
});
