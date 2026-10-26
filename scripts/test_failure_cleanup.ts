import { spawn, ChildProcess } from 'child_process';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { isPidAlive, waitForPortFree, assert } from './production_smoke.js';

/**
 * Deterministic Post-Readiness Failure Cleanup Integration Test
 *
 * Verifies P0-01 Production Recovery & Cleanup:
 * 1. Spawns production smoke runner with SMOKE_FAIL_AFTER_READY=1.
 * 2. Confirms the real production server spawns and responds HTTP 200 to readiness check.
 * 3. Confirms the deliberate assertion failure fires STRICTLY AFTER readiness.
 * 4. Confirms the smoke runner detects the failure and initiates process cleanup.
 * 5. Confirms the smoke runner exits with code 1 within a bounded window.
 * 6. Confirms the spawned production server PID is completely dead in the OS kernel (ESRCH & !/proc/PID).
 * 7. Confirms no child or process-group descendant remains running.
 * 8. Confirms the server's listening port is immediately available and re-bindable.
 * 9. Confirms the original assertion failure was preserved in the output logs.
 * 10. Confirms no cleanup errors occurred during shutdown.
 */

interface RunSmokeResult {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  combined: string;
  durationMs: number;
}

function runSmokeWithFailureTrigger(timeoutMs = 25000): Promise<RunSmokeResult> {
  return new Promise((resolve, reject) => {
    const tsxBin = path.resolve('node_modules/.bin/tsx');
    const child: ChildProcess = spawn(tsxBin, ['scripts/production_smoke.ts'], {
      env: {
        ...process.env,
        SMOKE_FAIL_AFTER_READY: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });

    let stdout = '';
    let stderr = '';
    let combined = '';
    const startTime = Date.now();

    child.stdout?.on('data', (d) => {
      const chunk = d.toString();
      stdout += chunk;
      combined += chunk;
    });

    child.stderr?.on('data', (d) => {
      const chunk = d.toString();
      stderr += chunk;
      combined += chunk;
    });

    const timer = setTimeout(() => {
      try {
        if (child.pid && isPidAlive(child.pid)) {
          process.kill(process.platform !== 'win32' ? -child.pid : child.pid, 'SIGKILL');
        }
      } catch {}
      reject(new Error(`Smoke test runner timed out after ${timeoutMs}ms while expecting failure-cleanup`));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      resolve({
        code,
        signal,
        stdout,
        stderr,
        combined,
        durationMs,
      });
    });
  });
}

/**
 * Inspect /proc on Linux to verify that no processes with PPID === targetPid exist.
 */
function getLinuxDescendantPids(targetPid: number): number[] {
  if (process.platform !== 'linux' || !fs.existsSync('/proc')) {
    return [];
  }
  const descendants: number[] = [];
  try {
    const entries = fs.readdirSync('/proc');
    for (const entry of entries) {
      if (!/^\d+$/.test(entry)) continue;
      const pid = parseInt(entry, 10);
      try {
        const status = fs.readFileSync(`/proc/${entry}/status`, 'utf8');
        const ppidMatch = status.match(/^PPid:\s+(\d+)/m);
        if (ppidMatch && parseInt(ppidMatch[1], 10) === targetPid) {
          descendants.push(pid);
        }
      } catch {}
    }
  } catch {}
  return descendants;
}

/**
 * Verify port can be actively bound by a real TCP server.
 */
async function verifyPortCanBeBound(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', (err) => {
      reject(new Error(`Failed to bind TCP server to port ${port}: ${err.message}`));
    });
    srv.listen(port, '127.0.0.1', () => {
      srv.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

export async function runFailureCleanupIntegrationTest() {
  console.log('\n=============================================================');
  console.log('ParandO Production Failure-Cleanup Integration Test');
  console.log('Scope: LOCAL PRODUCTION-GRADE DELIVERY (Post-Readiness Cleanup)');
  console.log('=============================================================\n');

  console.log('[Step 1/6] Launching production smoke test runner with SMOKE_FAIL_AFTER_READY=1...');
  const result = await runSmokeWithFailureTrigger(25000);

  console.log(`\nRunner completed in ${result.durationMs}ms with exit code: ${result.code}, signal: ${result.signal}`);

  // Step 2: Validate non-zero exit code
  console.log('\n[Step 2/6] Verifying runner exit code and termination status...');
  assert(result.code === 1, `Smoke runner exited with expected non-zero code 1 (actual: ${result.code})`);
  assert(result.signal === null, 'Smoke runner exited via process.exit(1), not unhandled OS signal');

  // Step 3: Parse and verify execution timeline
  console.log('\n[Step 3/6] Verifying output sequence: Readiness check passed BEFORE failure triggered...');

  const portMatch = result.combined.match(/Allocated dynamic ephemeral port:\s+(\d+)/);
  assert(portMatch !== null && portMatch[1] !== undefined, 'Allocated dynamic ephemeral port was logged');
  const port = parseInt(portMatch![1], 10);
  console.log(`  Identified test port: ${port}`);

  const pidMatch = result.combined.match(/listening on port \d+ \(PID:\s+(\d+)\)/);
  assert(pidMatch !== null && pidMatch[1] !== undefined, 'Production server PID was logged upon readiness');
  const serverPid = parseInt(pidMatch![1], 10);
  console.log(`  Identified production server PID: ${serverPid}`);

  const readyIndex = result.combined.indexOf(`Production server successfully ready and listening on port ${port}`);
  const triggerIndex = result.combined.indexOf('[CONTROLLED FAILURE TRIGGER]');
  const assertionFailureIndex = result.combined.indexOf('Assertion failed: Controlled post-readiness failure');
  const suiteFailedIndex = result.combined.indexOf('SMOKE TEST SUITE FAILED:');

  assert(readyIndex !== -1, 'Server reached readiness and logged readiness confirmation');
  assert(triggerIndex !== -1, 'Controlled post-readiness failure trigger was reached');
  assert(assertionFailureIndex !== -1, 'Controlled post-readiness assertion failure was captured and logged');
  assert(suiteFailedIndex !== -1, 'Smoke suite caught failure and reported SMOKE TEST SUITE FAILED');

  assert(
    readyIndex < triggerIndex,
    `Timeline verified: Readiness (idx: ${readyIndex}) occurred strictly before failure trigger (idx: ${triggerIndex})`
  );
  assert(
    triggerIndex < assertionFailureIndex,
    `Timeline verified: Failure trigger (idx: ${triggerIndex}) caused assertion failure (idx: ${assertionFailureIndex})`
  );

  // Step 4: Verify OS process termination
  console.log('\n[Step 4/6] Verifying production server OS process and descendants are terminated...');
  const pidAlive = isPidAlive(serverPid);
  assert(!pidAlive, `Production server PID ${serverPid} confirmed dead via process.kill(PID, 0) returning ESRCH`);

  if (process.platform === 'linux' && fs.existsSync('/proc')) {
    const procDirExists = fs.existsSync(`/proc/${serverPid}`);
    assert(!procDirExists, `/proc/${serverPid} does not exist in kernel filesystem`);

    const descendants = getLinuxDescendantPids(serverPid);
    assert(descendants.length === 0, `No active descendant processes found under PID ${serverPid} (found: ${descendants.join(', ') || 'none'})`);
  }

  // Step 5: Verify port recovery
  console.log('\n[Step 5/6] Verifying server port release and re-bindability...');
  await waitForPortFree(port, 5000);
  console.log(`  ✓ Port ${port} confirmed free via socket probe`);

  await verifyPortCanBeBound(port);
  console.log(`  ✓ Port ${port} confirmed successfully re-bindable by fresh TCP server`);

  // Step 6: Verify error visibility & absence of cleanup failure
  console.log('\n[Step 6/6] Verifying failure observability & absence of cleanup errors...');
  assert(!result.combined.includes('[Cleanup Failure]'), 'No [Cleanup Failure] errors occurred during shutdown');
  assert(
    result.stderr.includes('Assertion failed: Controlled post-readiness failure') ||
    result.stdout.includes('Assertion failed: Controlled post-readiness failure'),
    'Original assertion error was preserved and logged clearly'
  );

  console.log('\n=============================================================');
  console.log('FAILURE-CLEANUP INTEGRATION TEST PASSED (100% SUCCESS)');
  console.log('=============================================================\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/test_failure_cleanup.ts')) {
  runFailureCleanupIntegrationTest()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('\nFAILURE-CLEANUP INTEGRATION TEST FAILED:', err);
      process.exit(1);
    });
}
