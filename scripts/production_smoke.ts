import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';
import { generateTestToken } from '../src/auth/test_token_helper';

/**
 * ParandO Production Smoke Test Suite & Process Lifecycle Engine
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
 *     with explicit exit event verification for both initial and restarted server processes.
 * 12. Forced-termination escalation (SIGKILL) when a child process ignores graceful signals,
 *     verifying the kernel exit event, signal code, and process group cleanup.
 */

export const activeProcesses: ChildProcess[] = [];

export function registerChild(child: ChildProcess): void {
  activeProcesses.push(child);
  child.once('exit', () => {
    const idx = activeProcesses.indexOf(child);
    if (idx !== -1) {
      activeProcesses.splice(idx, 1);
    }
  });
}

export function isPidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Determine whether a process is still alive in the operating system.
 * CRITICAL: Never relies on `child.killed`, which in Node.js only indicates
 * whether child.kill() was called, NOT whether the process has exited.
 */
export function isProcessAlive(child: ChildProcess): boolean {
  if (!child.pid) return false;
  if (child.exitCode !== null || child.signalCode !== null) return false;
  return isPidAlive(child.pid);
}

/**
 * Dispatches a POSIX signal to a child process and its process group.
 * Does NOT check `child.killed`, allowing escalation signals (e.g. SIGKILL)
 * to be dispatched after an initial graceful signal.
 */
export function sendSignal(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): boolean {
  if (!child.pid || !isProcessAlive(child)) {
    return false;
  }

  let sent = false;
  if (process.platform !== 'win32') {
    try {
      // Signal the detached process group
      process.kill(-child.pid, signal);
      sent = true;
    } catch (errGroup: any) {
      if (errGroup.code !== 'ESRCH') {
        try {
          process.kill(child.pid, signal);
          sent = true;
        } catch (errPid: any) {
          if (errPid.code !== 'ESRCH') {
            try {
              sent = child.kill(signal);
            } catch {}
          }
        }
      }
    }
  } else {
    try {
      sent = child.kill(signal);
    } catch {}
  }

  return sent;
}

/**
 * Asynchronously cleans up all registered active processes, giving them
 * a bounded duration to exit cleanly before reporting or timing out.
 */
export async function cleanupAllAsync(timeoutMs = 3000): Promise<void> {
  const aliveChildren = activeProcesses.filter((child) => isProcessAlive(child));
  if (aliveChildren.length === 0) return;

  for (const child of aliveChildren) {
    sendSignal(child, 'SIGKILL');
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const remaining = aliveChildren.filter((child) => isProcessAlive(child));
    if (remaining.length === 0) {
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  const lingering = aliveChildren.filter((child) => isProcessAlive(child));
  if (lingering.length > 0) {
    const pids = lingering.map((c) => c.pid).join(', ');
    const cleanupError = new Error(`[Cleanup Failure] Processes failed to exit within ${timeoutMs}ms after SIGKILL: PIDs ${pids}`);
    console.error(cleanupError.message);
    throw cleanupError;
  }
}

export function cleanupAllSync(): void {
  for (const child of activeProcesses) {
    if (isProcessAlive(child)) {
      sendSignal(child, 'SIGKILL');
    }
  }
}

process.on('exit', cleanupAllSync);
process.on('SIGINT', async () => {
  try {
    await cleanupAllAsync(2000);
  } finally {
    process.exit(1);
  }
});
process.on('SIGTERM', async () => {
  try {
    await cleanupAllAsync(2000);
  } finally {
    process.exit(1);
  }
});

export async function getFreePort(): Promise<number> {
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

export function httpRequest(
  options: http.RequestOptions,
  postData?: string
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      timeout: 5000,
      ...options,
    };
    const req = http.request(opts, (res) => {
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
    req.on('timeout', () => {
      req.destroy(new Error(`HTTP request to ${options.path || '/'} timed out after ${opts.timeout}ms`));
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

export async function waitForServerReady(child: ChildProcess, port: number, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isProcessAlive(child)) {
      throw new Error(
        `Server process exited prematurely with code ${child.exitCode}, signal ${child.signalCode} before becoming ready on port ${port}`
      );
    }
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

export async function waitForPortFree(port: number, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const isFree = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(500);
      let settled = false;
      const done = (free: boolean) => {
        if (!settled) {
          settled = true;
          socket.destroy();
          resolve(free);
        }
      };
      socket.on('connect', () => done(false));
      socket.on('timeout', () => done(true));
      socket.on('error', () => done(true));
      socket.connect(port, '127.0.0.1');
    });
    if (isFree) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Port ${port} was not freed within ${timeoutMs}ms`);
}

export interface TerminationResult {
  code: number | null;
  signal: string | null;
  escalated: boolean;
}

/**
 * Terminates a child process with bounded graceful timeout and guaranteed forced escalation.
 *
 * Characteristics:
 * 1. Checks `isProcessAlive` instead of `child.killed`.
 * 2. If already exited, immediately resolves with recorded exit state.
 * 3. Sends `initialSignal` (e.g. SIGTERM) to process group.
 * 4. Escalates to `SIGKILL` after `escalationDelayMs` if process remains alive.
 * 5. Bounded hard timeout ensures no infinite hangs.
 * 6. Explicitly observes and returns the verified `exit` event.
 */
export async function terminateServerGracefully(
  child: ChildProcess,
  initialSignal: NodeJS.Signals = 'SIGTERM',
  timeoutMs = 6000
): Promise<TerminationResult> {
  if (!child.pid || !isProcessAlive(child)) {
    return {
      code: child.exitCode,
      signal: child.signalCode as string | null,
      escalated: false,
    };
  }

  return new Promise<TerminationResult>((resolve, reject) => {
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;
    let escalated = false;

    const cleanupListenersAndTimers = () => {
      settled = true;
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
    };

    const onExit = (code: number | null, sig: string | null) => {
      if (settled) return;
      cleanupListenersAndTimers();
      resolve({
        code: code ?? child.exitCode,
        signal: sig ?? (child.signalCode as string | null),
        escalated,
      });
    };

    const onError = (err: Error) => {
      if (settled) return;
      if (!isProcessAlive(child)) {
        cleanupListenersAndTimers();
        resolve({
          code: child.exitCode,
          signal: child.signalCode as string | null,
          escalated,
        });
      }
    };

    child.once('exit', onExit);
    child.once('error', onError);

    // Send initial graceful signal
    sendSignal(child, initialSignal);

    // Escalation timer: if still alive after escalationDelayMs, dispatch SIGKILL
    const escalationDelayMs = Math.min(Math.floor(timeoutMs * 0.5), Math.max(1000, timeoutMs - 2000));
    forceKillTimer = setTimeout(() => {
      if (!settled && isProcessAlive(child)) {
        escalated = true;
        sendSignal(child, 'SIGKILL');
      }
    }, escalationDelayMs);

    // Hard bounded timeout
    timeoutTimer = setTimeout(() => {
      if (!settled) {
        if (isProcessAlive(child)) {
          // Final forced SIGKILL
          sendSignal(child, 'SIGKILL');
          cleanupListenersAndTimers();
          reject(
            new Error(
              `Process PID ${child.pid} did not exit within ${timeoutMs}ms after ${initialSignal} (escalated: ${escalated})`
            )
          );
        } else {
          cleanupListenersAndTimers();
          resolve({
            code: child.exitCode,
            signal: child.signalCode as string | null,
            escalated,
          });
        }
      }
    }, timeoutMs);
  });
}

export function spawnProductionServer(port: number, extraEnv?: NodeJS.ProcessEnv): ChildProcess {
  const tsxBin = path.resolve('node_modules/.bin/tsx');
  const child = spawn(tsxBin, ['server.ts'], {
    env: {
      ...process.env,
      ...extraEnv,
      NODE_ENV: 'production',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });

  registerChild(child);
  console.log(`[SERVER_SPAWNED] Port: ${port}, PID: ${child.pid}, PGID: ${child.pid}`);

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

export function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

export async function runProductionSmokeTests() {
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
  console.log('[Test 1/12] Validating production index.html build sanitization...');
  const distHtml = fs.readFileSync(distHtmlPath, 'utf8');
  assert(!distHtml.includes('<!--DEV_ONLY_SCRIPT_START-->'), 'dist/index.html does not contain DEV_ONLY_SCRIPT_START marker');
  assert(!distHtml.includes('<!--DEV_ONLY_SCRIPT_END-->'), 'dist/index.html does not contain DEV_ONLY_SCRIPT_END marker');
  assert(!distHtml.includes('ViteMockWebSocket'), 'dist/index.html does not contain ViteMockWebSocket');
  assert(!distHtml.includes('createWebSocketModuleRunnerTransport'), 'dist/index.html does not contain createWebSocketModuleRunnerTransport');
  assert(distHtml.includes('<div id="root">'), 'dist/index.html contains root mount node');

  // Allocate dynamic ephemeral port and ephemeral smoke auth credentials
  const port = await getFreePort();
  const smokeSecret = crypto.randomBytes(32).toString('hex');
  const smokeToken = generateTestToken(
    {
      sub: 'smoke-tester',
      tid: 'tenant-gold-bourse',
      roles: ['OFFERER'],
      eligible: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    smokeSecret
  );
  console.log(`\nAllocated dynamic ephemeral port: ${port}`);

  console.log(`\n[Test 2/12] Spawning production server on port ${port}...`);
  let serverProcess = spawnProductionServer(port, { PARANDO_AUTH_SECRET: smokeSecret });

  try {
    await waitForServerReady(serverProcess, port);
    console.log(`Production server successfully ready and listening on port ${port} (PID: ${serverProcess.pid}, PGID: ${serverProcess.pid})`);

    // Controlled negative check trigger: only executes AFTER the server is verified ready
    if (process.env.SMOKE_FORCE_FAIL === '1' || process.env.SMOKE_FAIL_AFTER_READY === '1') {
      console.log(`\n[CONTROLLED FAILURE TRIGGER] Server verified healthy and ready on port ${port} (PID: ${serverProcess.pid}, PGID: ${serverProcess.pid}).`);
      console.log('[CONTROLLED FAILURE TRIGGER] Triggering deliberate post-readiness assertion failure to verify cleanup...');
      assert(false, 'Controlled post-readiness failure: simulated test failure while production server is actively running');
    }

    // Controlled hang trigger: forces runner hang after server readiness to test harness timeout cleanup
    if (process.env.SMOKE_HANG_AFTER_READY === '1') {
      console.log(`\n[CONTROLLED HANG TRIGGER] Server verified healthy and ready on port ${port} (PID: ${serverProcess.pid}, PGID: ${serverProcess.pid}).`);
      console.log('[CONTROLLED HANG TRIGGER] Simulating runner hang after server readiness to trigger harness timeout...');
      // Indefinitely keep process alive until terminated by harness timeout handler
      await new Promise(() => {});
    }

    // Assertion 1: GET /health
    console.log('\n[Test 3/12] Testing GET /health...');
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
    console.log('\n[Test 4/12] Testing GET /api/v1/health...');
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
    console.log('\n[Test 5/12] Testing GET / (root static HTML delivery)...');
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
    console.log('\n[Test 6/12] Testing GET /competitions/COMP-GOLD-001 (SPA fallback)...');
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
    console.log('\n[Test 7/12] Testing GET /api/v1/competitions (API routing)...');
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
    console.log('\n[Test 8/12] Testing GET /api/v1/nonexistent (404 JSON for unknown API routes)...');
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
    console.log('\n[Test 9/12] Testing WebSocket connection on ws://127.0.0.1:' + port + '/ws...');
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
        headers: { Authorization: `Bearer ${smokeToken}` },
      });
      let presenceReceived = false;
      let pongStringReceived = false;
      let pongJsonReceived = false;
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.terminate();
          reject(new Error('WebSocket /ws interaction timed out'));
        }
      }, 5000);

      const cleanup = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
        }
      };

      ws.on('open', () => {
        ws.send('ping');
      });

      ws.on('message', (data) => {
        const text = data.toString();
        if (text === 'pong') {
          pongStringReceived = true;
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
          cleanup();
          ws.close();
          assert(true, 'Received PRESENCE_SYNC, string pong, and JSON PONG on /ws');
          resolve();
        }
      });

      ws.on('error', (err) => {
        if (!settled) {
          cleanup();
          reject(err);
        }
      });
    });

    // Assertion 9: WebSocket connection on /ws/competitions/COMP-GOLD-001
    console.log('\n[Test 10/12] Testing WebSocket competition snapshot on ws://127.0.0.1:' + port + '/ws/competitions/COMP-GOLD-001...');
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/competitions/COMP-GOLD-001`, {
        headers: { Authorization: `Bearer ${smokeToken}` },
      });
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.terminate();
          reject(new Error('WebSocket competition snapshot timed out'));
        }
      }, 5000);

      const cleanup = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
        }
      };

      ws.on('message', (data) => {
        try {
          const json = JSON.parse(data.toString());
          if (json.type === 'ladder.snapshot') {
            assert(json.competition_id === 'COMP-GOLD-001', 'ladder.snapshot competition_id matches');
            assert(Array.isArray(json.ladder), 'ladder.snapshot includes ladder array');
            cleanup();
            ws.close();
            resolve();
          }
        } catch {}
      });

      ws.on('error', (err) => {
        if (!settled) {
          cleanup();
          reject(err);
        }
      });
    });

    // Assertion 10: Unsupported WebSocket upgrade path rejection
    console.log('\n[Test 11/12 part A] Testing unsupported WebSocket upgrade path rejection (/invalid-ws-route)...');
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/invalid-ws-route`);
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.terminate();
          reject(new Error('Expected rejection for invalid WebSocket route, but connection timed out'));
        }
      }, 4000);

      const cleanup = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
        }
      };

      ws.on('open', () => {
        cleanup();
        ws.close();
        reject(new Error('Expected rejection for /invalid-ws-route, but connection succeeded!'));
      });

      ws.on('error', () => {
        if (!settled) {
          cleanup();
          assert(true, 'Unsupported WebSocket route /invalid-ws-route rejected and destroyed');
          resolve();
        }
      });

      ws.on('close', () => {
        if (!settled) {
          cleanup();
          assert(true, 'Unsupported WebSocket route /invalid-ws-route closed without 101');
          resolve();
        }
      });
    });

    // Assertion 11: Graceful shutdown and clean restart on identical port
    console.log('\n[Test 11/12 part B] Testing graceful shutdown (SIGTERM) and port recovery on same port ' + port + '...');
    const exitResult1 = await terminateServerGracefully(serverProcess, 'SIGTERM', 6000);
    assert(
      exitResult1.code === 0 || exitResult1.signal === 'SIGTERM',
      `Initial server exited cleanly (code: ${exitResult1.code}, signal: ${exitResult1.signal})`
    );

    // Verify port is freed
    await waitForPortFree(port);
    assert(true, `Port ${port} successfully released after initial server exit`);

    // Restart server on identical port
    console.log(`Restarting production server on SAME port ${port}...`);
    serverProcess = spawnProductionServer(port, { PARANDO_AUTH_SECRET: smokeSecret });
    await waitForServerReady(serverProcess, port);

    const restartHealthRes = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/health',
      method: 'GET',
    });
    assert(restartHealthRes.status === 200, `Restarted server returned HTTP 200 on port ${port}`);

    // Cleanly terminate restart process - explicitly await its exit event
    console.log(`Terminating restarted server and verifying process exit event...`);
    const exitResult2 = await terminateServerGracefully(serverProcess, 'SIGTERM', 6000);
    assert(
      exitResult2.code === 0 || exitResult2.signal === 'SIGTERM',
      `Restarted server exited cleanly (code: ${exitResult2.code}, signal: ${exitResult2.signal})`
    );
    await waitForPortFree(port);
    assert(true, `Restarted server port ${port} released`);

    // Assertion 12: Forced-termination escalation (SIGKILL) on unresponsive process
    console.log('\n[Test 12/12] Testing forced-termination escalation (SIGKILL) on unresponsive process...');
    const stubbornChild = await new Promise<ChildProcess>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['-e', 'process.on("SIGTERM", () => { /* trap and ignore */ }); console.log("STUBBORN_READY"); setInterval(() => {}, 500);'],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
        }
      );
      registerChild(child);
      const timer = setTimeout(() => reject(new Error('Timeout waiting for stubborn child STUBBORN_READY')), 4000);
      child.stdout?.on('data', (d) => {
        if (d.toString().includes('STUBBORN_READY')) {
          clearTimeout(timer);
          resolve(child);
        }
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('exit', (code, sig) => {
        clearTimeout(timer);
        reject(new Error(`Stubborn child exited prematurely (code: ${code}, signal: ${sig})`));
      });
    });

    const stubbornPid = stubbornChild.pid;
    assert(typeof stubbornPid === 'number', `Spawned stubborn child process with PID ${stubbornPid}`);
    assert(isProcessAlive(stubbornChild), `Stubborn child PID ${stubbornPid} is confirmed alive and signal trap ready`);

    const escalationResult = await terminateServerGracefully(stubbornChild, 'SIGTERM', 3500);
    assert(escalationResult.escalated === true, 'Forced-termination escalation to SIGKILL was triggered');
    assert(escalationResult.signal === 'SIGKILL', `Stubborn child terminated via kernel SIGKILL (signal: ${escalationResult.signal})`);
    assert(!isProcessAlive(stubbornChild), `Stubborn child PID ${stubbornPid} confirmed completely terminated`);

    console.log('\n=============================================================');
    console.log('ALL LOCAL PRODUCTION SMOKE TESTS PASSED (100% SUCCESS)');
    console.log('=============================================================\n');
  } finally {
    await cleanupAllAsync(3000);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/production_smoke.ts')) {
  runProductionSmokeTests()
    .then(() => {
      process.exit(0);
    })
    .catch(async (primaryError) => {
      console.error('\nSMOKE TEST SUITE FAILED:', primaryError);
      try {
        await cleanupAllAsync(3000);
      } catch (cleanupErr) {
        console.error('Error during post-failure cleanup:', cleanupErr);
      } finally {
        process.exit(1);
      }
    });
}
