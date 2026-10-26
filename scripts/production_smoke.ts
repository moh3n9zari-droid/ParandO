import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';

/**
 * ParandO Production Smoke Test Suite
 *
 * Validates local production-grade delivery acceptance criteria:
 * 1. Health check endpoint (/health) returns 200 JSON
 * 2. Versioned health check endpoint (/api/v1/health) returns 200 JSON
 * 3. Root static delivery (/) returns 200 HTML
 * 4. Client SPA route fallback (/competitions/COMP-GOLD-001) returns 200 HTML
 * 5. Existing API endpoint (/api/v1/competitions) returns 200 JSON
 * 6. Unknown API endpoint (/api/v1/nonexistent) returns 404 JSON (not SPA HTML)
 * 7. Built production HTML (dist/index.html) contains neither dev HMR mock nor marker strings
 * 8. WebSocket handshake on /ws (presence sync, ping/pong string, PING/PONG JSON)
 * 9. WebSocket handshake on /ws/competitions/:id (ladder.snapshot)
 * 10. Unsupported WebSocket upgrade path rejection (socket destroyed)
 * 11. Graceful shutdown (SIGTERM) releasing port, and clean restart on identical port
 */

const activeProcesses: ChildProcess[] = [];

function registerChild(child: ChildProcess) {
  activeProcesses.push(child);
}

function killProcess(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM') {
  if (!child.pid || child.killed) return;
  try {
    if (process.platform !== 'win32') {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch {
    try {
      child.kill(signal);
    } catch {}
  }
}

function cleanupAll() {
  for (const child of activeProcesses) {
    killProcess(child, 'SIGKILL');
  }
}

process.on('exit', cleanupAll);
process.on('SIGINT', () => {
  cleanupAll();
  process.exit(1);
});
process.on('SIGTERM', () => {
  cleanupAll();
  process.exit(1);
});

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to obtain ephemeral port'));
        return;
      }
      const port = addr.port;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

function httpRequest(options: http.RequestOptions, postData?: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function waitForServerReady(port: number, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await httpRequest({
        hostname: '127.0.0.1',
        port,
        path: '/health',
        method: 'GET',
        timeout: 1000,
      });
      if (res.status === 200) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server failed to start and respond on port ${port} within ${timeoutMs}ms`);
}

async function waitForPortFree(port: number, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const isFree = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(500);
      socket.on('connect', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => {
        resolve(true);
      });
      socket.connect(port, '127.0.0.1');
    });
    if (isFree) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Port ${port} was not freed within ${timeoutMs}ms`);
}

function spawnProductionServer(port: number): ChildProcess {
  const tsxBin = path.resolve('node_modules/.bin/tsx');
  const child = spawn(tsxBin, ['server.ts'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });

  registerChild(child);

  child.stdout?.on('data', (d) => {
    const text = d.toString();
    if (process.env.DEBUG_SMOKE) process.stdout.write(`[Server stdout] ${text}`);
  });

  child.stderr?.on('data', (d) => {
    const text = d.toString();
    if (process.env.DEBUG_SMOKE) process.stderr.write(`[Server stderr] ${text}`);
  });

  return child;
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runProductionSmokeTests() {
  console.log('\n=============================================================');
  console.log('ParandO Local Production Smoke Verification Suite');
  console.log('Scope: LOCAL PRODUCTION-GRADE DELIVERY');
  console.log('=============================================================\n');

  // Verify dist/ exists
  const distHtmlPath = path.resolve('dist/index.html');
  if (!fs.existsSync(distHtmlPath)) {
    throw new Error('dist/index.html not found! Run npm run build before running smoke tests.');
  }

  // Assertion 7: Production HTML sanitization
  console.log('[Test 1/11] Validating production index.html build sanitization...');
  const distHtml = fs.readFileSync(distHtmlPath, 'utf8');
  assert(!distHtml.includes('<!--DEV_ONLY_SCRIPT_START-->'), 'dist/index.html does not contain DEV_ONLY_SCRIPT_START marker');
  assert(!distHtml.includes('<!--DEV_ONLY_SCRIPT_END-->'), 'dist/index.html does not contain DEV_ONLY_SCRIPT_END marker');
  assert(!distHtml.includes('ViteMockWebSocket'), 'dist/index.html does not contain ViteMockWebSocket');
  assert(!distHtml.includes('createWebSocketModuleRunnerTransport'), 'dist/index.html does not contain createWebSocketModuleRunnerTransport');
  assert(distHtml.includes('<div id="root">'), 'dist/index.html contains root mount node');

  // Allocate dynamic ephemeral port
  const port = await getFreePort();
  console.log(`\nAllocated dynamic ephemeral port: ${port}`);

  console.log(`\n[Test 2/11] Spawning production server on port ${port}...`);
  let serverProcess = spawnProductionServer(port);

  try {
    await waitForServerReady(port);
    console.log(`Production server successfully ready and listening on port ${port}`);

    // Assertion 1: GET /health
    console.log('\n[Test 3/11] Testing GET /health...');
    const healthRes = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/health',
      method: 'GET',
    });
    assert(healthRes.status === 200, 'GET /health returned HTTP 200');
    assert(healthRes.headers['content-type']?.includes('application/json') || false, 'GET /health Content-Type is application/json');
    const healthJson = JSON.parse(healthRes.body);
    assert(healthJson.status === 'healthy', 'GET /health body status is "healthy"');
    assert(healthJson.service === 'parando-auction-ecosystem', 'GET /health service name matches');
    assert(Array.isArray(healthJson.standards) && healthJson.standards.includes('ADR-001'), 'GET /health lists ADR standards');

    // Assertion 2: GET /api/v1/health
    console.log('\n[Test 4/11] Testing GET /api/v1/health...');
    const v1HealthRes = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/health',
      method: 'GET',
    });
    assert(v1HealthRes.status === 200, 'GET /api/v1/health returned HTTP 200');
    const v1HealthJson = JSON.parse(v1HealthRes.body);
    assert(v1HealthJson.status === 'healthy', 'GET /api/v1/health body status is "healthy"');
    assert(v1HealthJson.service === 'parando-auction-ecosystem', 'GET /api/v1/health service matches');

    // Assertion 3: GET / (Root HTML)
    console.log('\n[Test 5/11] Testing GET / (root static HTML delivery)...');
    const rootRes = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/',
      method: 'GET',
    });
    assert(rootRes.status === 200, 'GET / returned HTTP 200');
    assert(rootRes.headers['content-type']?.includes('text/html') || false, 'GET / Content-Type is text/html');
    assert(rootRes.body.includes('<!doctype html>') || rootRes.body.includes('<html'), 'GET / body is valid HTML');
    assert(rootRes.body.includes('<div id="root">'), 'GET / contains SPA root container');

    // Assertion 4: GET /competitions/COMP-GOLD-001 (SPA route fallback)
    console.log('\n[Test 6/11] Testing GET /competitions/COMP-GOLD-001 (SPA fallback)...');
    const spaRes = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/competitions/COMP-GOLD-001',
      method: 'GET',
    });
    assert(spaRes.status === 200, 'GET /competitions/COMP-GOLD-001 returned HTTP 200');
    assert(spaRes.headers['content-type']?.includes('text/html') || false, 'SPA fallback Content-Type is text/html');
    assert(spaRes.body.includes('<div id="root">'), 'SPA fallback serves index.html with root container');

    // Assertion 5: GET /api/v1/competitions
    console.log('\n[Test 7/11] Testing GET /api/v1/competitions (API routing)...');
    const apiRes = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/competitions',
      method: 'GET',
    });
    assert(apiRes.status === 200, 'GET /api/v1/competitions returned HTTP 200');
    const comps = JSON.parse(apiRes.body);
    assert(Array.isArray(comps), 'Competitions API returned array');
    assert(comps.length > 0, 'Competitions API returned at least one active auction');
    assert(comps.some((c: any) => c.competition_id === 'COMP-GOLD-001'), 'Gold auction (COMP-GOLD-001) is present');

    // Assertion 6: GET /api/v1/nonexistent (Unknown API route 404)
    console.log('\n[Test 8/11] Testing GET /api/v1/nonexistent (404 JSON for unknown API routes)...');
    const notFoundRes = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/v1/nonexistent',
      method: 'GET',
    });
    assert(notFoundRes.status === 404, 'GET /api/v1/nonexistent returned HTTP 404');
    assert(notFoundRes.headers['content-type']?.includes('application/json') || false, '404 Content-Type is application/json (not SPA HTML)');
    const notFoundJson = JSON.parse(notFoundRes.body);
    assert(notFoundJson.detail === 'API endpoint not found', '404 JSON detail matches expected message');

    // Assertion 8: Real application WebSocket handshake on /ws
    console.log('\n[Test 9/11] Testing WebSocket connection on ws://127.0.0.1:' + port + '/ws...');
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      let presenceReceived = false;
      let pongStringReceived = false;
      let pongJsonReceived = false;

      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('WebSocket /ws interaction timed out'));
      }, 5000);

      ws.on('open', () => {
        // Send string ping
        ws.send('ping');
      });

      ws.on('message', (data) => {
        const text = data.toString();
        if (text === 'pong') {
          pongStringReceived = true;
          // Send JSON PING
          ws.send(JSON.stringify({ type: 'PING' }));
          return;
        }

        try {
          const json = JSON.parse(text);
          if (json.type === 'PRESENCE_SYNC') {
            presenceReceived = true;
            assert(typeof json.payload?.activeWatchers === 'number', 'PRESENCE_SYNC contains activeWatchers count');
          } else if (json.type === 'PONG') {
            pongJsonReceived = true;
          }
        } catch {}

        if (presenceReceived && pongStringReceived && pongJsonReceived) {
          clearTimeout(timeout);
          ws.close();
          assert(true, 'Received PRESENCE_SYNC, string pong, and JSON PONG on /ws');
          resolve();
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Assertion 9: WebSocket connection on /ws/competitions/COMP-GOLD-001
    console.log('\n[Test 10/11] Testing WebSocket competition snapshot on ws://127.0.0.1:' + port + '/ws/competitions/COMP-GOLD-001...');
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/competitions/COMP-GOLD-001`);
      let snapshotReceived = false;

      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('WebSocket competition snapshot timed out'));
      }, 5000);

      ws.on('message', (data) => {
        try {
          const json = JSON.parse(data.toString());
          if (json.type === 'ladder.snapshot') {
            assert(json.competition_id === 'COMP-GOLD-001', 'ladder.snapshot competition_id matches');
            assert(Array.isArray(json.ladder), 'ladder.snapshot includes ladder array');
            snapshotReceived = true;
            clearTimeout(timeout);
            ws.close();
            resolve();
          }
        } catch {}
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Assertion 10: Unsupported WebSocket upgrade path rejection
    console.log('\n[Test 11/11 part A] Testing unsupported WebSocket upgrade path rejection (/invalid-ws-route)...');
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/invalid-ws-route`);
      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('Expected rejection for invalid WebSocket route, but connection timed out'));
      }, 3000);

      ws.on('open', () => {
        clearTimeout(timeout);
        ws.close();
        reject(new Error('Expected rejection for /invalid-ws-route, but connection succeeded!'));
      });

      ws.on('error', () => {
        clearTimeout(timeout);
        assert(true, 'Unsupported WebSocket route /invalid-ws-route rejected and destroyed');
        resolve();
      });

      ws.on('close', () => {
        clearTimeout(timeout);
        assert(true, 'Unsupported WebSocket route /invalid-ws-route closed without 101');
        resolve();
      });
    });

    // Assertion 11: Graceful shutdown and clean restart on identical port
    console.log('\n[Test 11/11 part B] Testing graceful shutdown (SIGTERM) and port recovery on same port ' + port + '...');
    const exitPromise = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
      serverProcess.on('exit', (code, signal) => {
        resolve({ code, signal });
      });
    });

    killProcess(serverProcess, 'SIGTERM');
    const exitResult = await Promise.race([
      exitPromise,
      new Promise<{ code: null; signal: null }>((_, reject) =>
        setTimeout(() => reject(new Error('Process did not exit after SIGTERM within 5s')), 5000)
      ),
    ]);
    assert(exitResult.code === 0 || exitResult.signal === 'SIGTERM', `Server exited cleanly (code: ${exitResult.code}, signal: ${exitResult.signal})`);

    // Verify port is freed
    await waitForPortFree(port);
    assert(true, `Port ${port} successfully released`);

    // Restart server on identical port
    console.log(`Restarting production server on SAME port ${port}...`);
    serverProcess = spawnProductionServer(port);
    await waitForServerReady(port);

    const restartHealthRes = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/health',
      method: 'GET',
    });
    assert(restartHealthRes.status === 200, `Restarted server returned HTTP 200 on port ${port}`);

    // Cleanly terminate restart process
    killProcess(serverProcess, 'SIGTERM');
    await waitForPortFree(port);
    assert(true, `Restarted server cleanly terminated and port ${port} freed`);

    console.log('\n=============================================================');
    console.log('ALL LOCAL PRODUCTION SMOKE TESTS PASSED (100% SUCCESS)');
    console.log('=============================================================\n');
  } finally {
    cleanupAll();
  }
}

runProductionSmokeTests().catch((err) => {
  console.error('\nSMOKE TEST SUITE FAILED:', err);
  cleanupAll();
  process.exit(1);
});
