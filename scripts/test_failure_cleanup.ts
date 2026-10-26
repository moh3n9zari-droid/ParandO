import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { waitForPortFree, assert } from './production_smoke.js';
import {
  isPidAlive,
  getLinuxProcessGroupPids,
  getRecursiveDescendants,
  getAllTrackedProcesses,
  terminateProcessGroupGracefully,
  verifyPortCanBeBound,
} from './process_tree.js';

/**
 * Deterministic Post-Readiness Failure Cleanup Integration Test
 *
 * Verifies P0-01 Production Recovery & Cleanup:
 * 1. Spawns production smoke runner with SMOKE_FAIL_AFTER_READY=1.
 * 2. Continuously tracks runner PID, server PID, and server PGID from stdout stream.
 * 3. Harness timeout handler terminates BOTH runner group and detached server group if timeout occurs.
 * 4. Confirms the real production server spawns, listens, and passes readiness BEFORE the failure.
 * 5. Confirms deliberate post-readiness assertion failure occurs on running server.
 * 6. Confirms smoke runner exits with code 1 within a bounded window.
 * 7. Confirms production server OS process is completely dead (ESRCH & /proc/PID removed).
 * 8. Confirms recursive descendants (children, grandchildren) and process group are completely empty.
 * 9. Confirms the server's listening port is immediately available and re-bindable by fresh TCP server.
 * 10. Confirms original assertion failure was preserved in output logs and no cleanup failure occurred.
 */

export interface RunSmokeResult {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  combined: string;
  durationMs: number;
  runnerPid: number;
  runnerPgid: number;
  port: number | null;
  serverPid: number | null;
  serverPgid: number | null;
  timedOut: boolean;
  cleanupError: string | null;
}

export function runSmokeWithHarness(
  envOverrides: Record<string, string>,
  timeoutMs = 25000,
  forceTimeoutOnMarker?: string
): Promise<RunSmokeResult> {
  return new Promise((resolve) => {
    const tsxBin = path.resolve('node_modules/.bin/tsx');
    const child: ChildProcess = spawn(tsxBin, ['scripts/production_smoke.ts'], {
      env: {
        ...process.env,
        ...envOverrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });

    const runnerPid = child.pid!;
    const runnerPgid = runnerPid;

    let stdout = '';
    let stderr = '';
    let combined = '';
    const startTime = Date.now();
    let settled = false;

    let port: number | null = null;
    let serverPid: number | null = null;
    let serverPgid: number | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;

    const parseStreamData = (chunk: string) => {
      // Ephemeral port
      if (!port) {
        const m = chunk.match(/Allocated dynamic ephemeral port:\s+(\d+)/);
        if (m) port = parseInt(m[1], 10);
      }
      // Server spawned / readiness log with PID & PGID
      if (!serverPid || !serverPgid) {
        const mSpawn = chunk.match(/\[SERVER_SPAWNED\]\s+Port:\s+(\d+),\s+PID:\s+(\d+),\s+PGID:\s+(\d+)/);
        if (mSpawn) {
          if (!port) port = parseInt(mSpawn[1], 10);
          serverPid = parseInt(mSpawn[2], 10);
          serverPgid = parseInt(mSpawn[3], 10);
        } else {
          const mReady = chunk.match(/listening on port \d+\s+\(PID:\s+(\d+)(?:,\s+PGID:\s+(\d+))?\)/);
          if (mReady) {
            serverPid = parseInt(mReady[1], 10);
            serverPgid = mReady[2] ? parseInt(mReady[2], 10) : serverPid;
          }
        }
      }

      // Check for forced timeout trigger on specific marker
      if (forceTimeoutOnMarker && chunk.includes(forceTimeoutOnMarker) && timeoutTimer) {
        // Trigger timeout cleanup immediately upon observing the hang marker
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
        triggerTimeoutCleanup();
      }
    };

    child.stdout?.on('data', (d) => {
      const chunk = d.toString();
      stdout += chunk;
      combined += chunk;
      parseStreamData(chunk);
    });

    child.stderr?.on('data', (d) => {
      const chunk = d.toString();
      stderr += chunk;
      combined += chunk;
      parseStreamData(chunk);
    });

    const triggerTimeoutCleanup = async () => {
      if (settled) return;
      settled = true;

      let cleanupErrMsg: string | null = null;

      try {
        console.log(`\n[HARNESS TIMEOUT] Reached timeout limit (${timeoutMs}ms). Initiating process cleanup...`);
        console.log(`[HARNESS TIMEOUT] Targets: Runner PID ${runnerPid} (PGID ${runnerPgid}), Server PID ${serverPid ?? 'unknown'} (PGID ${serverPgid ?? 'unknown'})`);

        // 1. Terminate detached server process group
        if (serverPgid || serverPid) {
          const srvRes = await terminateProcessGroupGracefully(serverPgid || serverPid!, serverPid || undefined, 4000);
          if (!srvRes.success) {
            cleanupErrMsg = `Failed to terminate server process group ${serverPgid}: lingering PIDs ${srvRes.lingeringPids.join(', ')}`;
          }
        }

        // 2. Terminate runner process group
        const runnerRes = await terminateProcessGroupGracefully(runnerPgid, runnerPid, 3000);
        if (!runnerRes.success) {
          cleanupErrMsg = (cleanupErrMsg ? cleanupErrMsg + '; ' : '') +
            `Failed to terminate runner process group ${runnerPgid}: lingering PIDs ${runnerRes.lingeringPids.join(', ')}`;
        }

        // 3. Verify port release
        if (port) {
          try {
            await waitForPortFree(port, 4000);
            await verifyPortCanBeBound(port);
          } catch (pErr: any) {
            cleanupErrMsg = (cleanupErrMsg ? cleanupErrMsg + '; ' : '') + `Port ${port} was not freed: ${pErr.message}`;
          }
        }
      } catch (err: any) {
        cleanupErrMsg = err.message;
      }

      const durationMs = Date.now() - startTime;
      resolve({
        code: child.exitCode,
        signal: child.signalCode as string | null,
        stdout,
        stderr,
        combined,
        durationMs,
        runnerPid,
        runnerPgid,
        port,
        serverPid,
        serverPgid,
        timedOut: true,
        cleanupError: cleanupErrMsg,
      });
    };

    timeoutTimer = setTimeout(() => {
      triggerTimeoutCleanup();
    }, timeoutMs);

    child.on('error', async (err) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (serverPgid || serverPid) {
        await terminateProcessGroupGracefully(serverPgid || serverPid!, serverPid || undefined, 3000);
      }
      resolve({
        code: null,
        signal: null,
        stdout,
        stderr: stderr + '\n' + err.message,
        combined: combined + '\n' + err.message,
        durationMs: Date.now() - startTime,
        runnerPid,
        runnerPgid,
        port,
        serverPid,
        serverPgid,
        timedOut: false,
        cleanupError: err.message,
      });
    });

    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      const durationMs = Date.now() - startTime;
      resolve({
        code,
        signal,
        stdout,
        stderr,
        combined,
        durationMs,
        runnerPid,
        runnerPgid,
        port,
        serverPid,
        serverPgid,
        timedOut: false,
        cleanupError: null,
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
  const result = await runSmokeWithHarness({ SMOKE_FAIL_AFTER_READY: '1' }, 25000);

  console.log(`\nRunner completed in ${result.durationMs}ms with exit code: ${result.code}, signal: ${result.signal}`);

  // Step 2: Validate non-zero exit code
  console.log('\n[Step 2/6] Verifying runner exit code and termination status...');
  assert(!result.timedOut, 'Smoke runner exited on failure without hitting harness timeout');
  assert(result.code === 1, `Smoke runner exited with expected non-zero code 1 (actual: ${result.code})`);
  assert(result.signal === null, 'Smoke runner exited via process.exit(1), not unhandled OS signal');

  // Step 3: Parse and verify execution timeline
  console.log('\n[Step 3/6] Verifying output sequence: Readiness check passed BEFORE failure triggered...');

  assert(result.port !== null && typeof result.port === 'number', `Identified dynamic ephemeral port: ${result.port}`);
  assert(result.serverPid !== null && typeof result.serverPid === 'number', `Identified production server PID: ${result.serverPid}`);
  const port = result.port!;
  const serverPid = result.serverPid!;
  const serverPgid = result.serverPgid || serverPid;
  console.log(`  Target Ephemeral Port: ${port}, Server PID: ${serverPid}, Server PGID: ${serverPgid}`);

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

  // Step 4: Verify OS process termination, recursive descendants, and process group
  console.log('\n[Step 4/6] Verifying production server OS process, recursive descendants, and process group...');
  const pidAlive = isPidAlive(serverPid);
  assert(!pidAlive, `Production server PID ${serverPid} confirmed dead via process.kill(PID, 0) returning ESRCH`);

  if (process.platform === 'linux' && fs.existsSync('/proc')) {
    const procDirExists = fs.existsSync(`/proc/${serverPid}`);
    assert(!procDirExists, `/proc/${serverPid} does not exist in kernel filesystem`);

    // Recursive descendants verification
    const descendants = getRecursiveDescendants(serverPid);
    assert(
      descendants.length === 0,
      `No recursive descendants (children/grandchildren) remain alive under PID ${serverPid} (surviving: ${descendants.join(', ') || 'none'})`
    );

    // Process group verification
    const groupPids = getLinuxProcessGroupPids(serverPgid);
    assert(
      groupPids.length === 0,
      `No surviving processes in detached server process group PGID ${serverPgid} (surviving: ${groupPids.join(', ') || 'none'})`
    );

    const allTracked = getAllTrackedProcesses(serverPgid, serverPid);
    assert(allTracked.length === 0, 'Zero surviving processes across process group and descendant hierarchy');
  } else {
    console.log('  [Platform Notice] Non-Linux environment; verified process dead via ESRCH signal probe.');
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
