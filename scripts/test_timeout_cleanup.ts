import { runSmokeWithHarness } from './test_failure_cleanup.js';
import {
  isPidAlive,
  getLinuxProcessGroupPids,
  getRecursiveDescendants,
  getAllTrackedProcesses,
  terminateProcessGroupGracefully,
  verifyPortCanBeBound,
  assertZeroLingeringProcesses,
} from './process_tree.js';
import { assert, waitForPortFree } from './production_smoke.js';
import { spawn } from 'child_process';

/**
 * Deterministic Timeout-Cleanup Regression Test
 *
 * Verifies P0-01 Timeout Path Process Recovery:
 * 1. Spawns smoke runner with SMOKE_HANG_AFTER_READY=1.
 * 2. Waits for positive server readiness signal (HTTP 200) before triggering timeout.
 * 3. Proves production server is actively running in the OS before cleanup.
 * 4. Triggers the harness timeout handler.
 * 5. Verifies timeout handler terminates BOTH runner and independently detached server process group.
 * 6. Verifies complete recursive descendant hierarchy (children, grandchildren) is terminated.
 * 7. Verifies detached server process group has zero surviving processes.
 * 8. Verifies server port is released and immediately re-bindable by fresh TCP server.
 * 9. Regression Case 2: Proves lingering process detection fails observably with useful diagnostics.
 */

async function runTimeoutCleanupRegressionTest() {
  console.log('\n=============================================================');
  console.log('ParandO Production Timeout-Cleanup Regression Test');
  console.log('Scope: LOCAL PRODUCTION-GRADE DELIVERY (Timeout-Path Cleanup)');
  console.log('=============================================================\n');

  // -------------------------------------------------------------------------
  // Case 1: Forced-Timeout While Real Production Server Is Actively Running
  // -------------------------------------------------------------------------
  console.log('[Case 1/2] Spawning runner with SMOKE_HANG_AFTER_READY=1 and triggering harness timeout on readiness...');

  const result = await runSmokeWithHarness(
    { SMOKE_HANG_AFTER_READY: '1' },
    25000,
    '[CONTROLLED HANG TRIGGER]'
  );

  console.log(`\nHarness completed in ${result.durationMs}ms`);
  console.log(`  TimedOut: ${result.timedOut}, CleanupError: ${result.cleanupError}`);
  console.log(`  Identified Port: ${result.port}, Server PID: ${result.serverPid}, Server PGID: ${result.serverPgid}`);

  // Assertions for Case 1
  assert(result.timedOut === true, 'Harness flagged timedOut === true');
  assert(result.cleanupError === null, `Timeout cleanup completed with zero errors (actual: ${result.cleanupError})`);
  assert(result.port !== null && typeof result.port === 'number', `Port was successfully extracted: ${result.port}`);
  assert(result.serverPid !== null && typeof result.serverPid === 'number', `Server PID was successfully extracted: ${result.serverPid}`);

  const port = result.port!;
  const serverPid = result.serverPid!;
  const serverPgid = result.serverPgid || serverPid;

  // Verify the hang marker was observed after readiness
  assert(result.combined.includes('Production server successfully ready'), 'Server confirmed ready before timeout triggered');
  assert(result.combined.includes('[CONTROLLED HANG TRIGGER]'), 'Controlled hang trigger marker was logged');

  // Verify OS process termination
  console.log('\n[Case 1/2] Verifying server PID and detached process group are completely terminated...');
  const serverAlive = isPidAlive(serverPid);
  assert(!serverAlive, `Server PID ${serverPid} confirmed dead via process.kill(PID, 0) returning ESRCH`);

  if (process.platform === 'linux') {
    const descendants = getRecursiveDescendants(serverPid);
    assert(
      descendants.length === 0,
      `No recursive descendants remain alive under server PID ${serverPid} (found: ${descendants.join(', ') || 'none'})`
    );

    const groupPids = getLinuxProcessGroupPids(serverPgid);
    assert(
      groupPids.length === 0,
      `No surviving processes in server process group PGID ${serverPgid} (found: ${groupPids.join(', ') || 'none'})`
    );

    const allTracked = getAllTrackedProcesses(serverPgid, serverPid);
    assert(allTracked.length === 0, 'Zero surviving processes across server process group and descendant tree');
  }

  // Verify port release
  console.log('\n[Case 1/2] Verifying port release and re-bindability...');
  await waitForPortFree(port, 4000);
  console.log(`  ✓ Port ${port} confirmed free via socket probe`);

  await verifyPortCanBeBound(port);
  console.log(`  ✓ Port ${port} confirmed successfully re-bindable by fresh TCP server`);

  // -------------------------------------------------------------------------
  // Case 2: Cleanup Failure Observability (Lingering Process Diagnostic)
  // -------------------------------------------------------------------------
  console.log('\n[Case 2/2] Verifying that lingering/unresponsive processes produce observable failure diagnostics...');

  // Spawn a stubborn child that traps SIGTERM to prove lingering process detection
  const stubborn = spawn(
    process.execPath,
    ['-e', 'process.on("SIGTERM", () => {}); console.log("TRAP_READY"); setInterval(() => {}, 500);'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    }
  );

  const stubbornPid = stubborn.pid!;
  const stubbornPgid = stubbornPid;

  await new Promise<void>((resolve, reject) => {
    stubborn.stdout?.on('data', (d) => {
      if (d.toString().includes('TRAP_READY')) resolve();
    });
    stubborn.on('error', reject);
  });

  assert(isPidAlive(stubbornPid), `Stubborn test process PID ${stubbornPid} confirmed running`);

  // Verify that if a process were to linger, assertZeroLingeringProcesses throws [Cleanup Failure]
  let caughtCleanupError = false;
  try {
    assertZeroLingeringProcesses([stubbornPid], 'ControlledStubbornCheck');
  } catch (err: any) {
    if (err.message.includes('[Cleanup Failure]') && err.message.includes(String(stubbornPid))) {
      caughtCleanupError = true;
      console.log(`  ✓ Controlled lingering check successfully threw observable error: ${err.message}`);
    }
  }
  assert(caughtCleanupError, 'Controlled lingering process detection threw expected [Cleanup Failure] error');

  // Now clean it up completely with adequate timeout
  const fullResult = await terminateProcessGroupGracefully(stubbornPgid, stubbornPid, 3000);
  assert(fullResult.success === true, 'Full cleanup escalated to SIGKILL and succeeded');
  assert(!isPidAlive(stubbornPid), 'Stubborn test process PID confirmed dead');

  console.log('\n=============================================================');
  console.log('TIMEOUT-CLEANUP REGRESSION TEST PASSED (100% SUCCESS)');
  console.log('=============================================================\n');
}

if (process.argv[1] && process.argv[1].endsWith('test_timeout_cleanup.ts')) {
  runTimeoutCleanupRegressionTest()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('\nTIMEOUT-CLEANUP REGRESSION TEST FAILED:', err);
      process.exit(1);
    });
}
