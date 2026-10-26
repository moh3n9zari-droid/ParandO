import { runSmokeWithHarness } from './test_failure_cleanup.js';
import {
  isPidAlive,
  getLinuxProcessGroupPids,
  getRecursiveDescendants,
  getAllTrackedProcesses,
  terminateProcessGroupGracefully,
  verifyPortCanBeBound,
  assertZeroLingeringProcesses,
  waitForPidDead,
  waitForProcessGroupEmpty,
} from './process_tree.js';
import { assert, waitForPortFree } from './production_smoke.js';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Deterministic Timeout-Cleanup Regression Test
 *
 * Verifies P0-01 Timeout Path Process Recovery:
 * 1. Spawns smoke runner with SMOKE_HANG_AFTER_READY=1.
 * 2. Waits for positive server readiness signal (HTTP 200) before triggering timeout.
 * 3. Proves production server is actively running in the OS before cleanup.
 * 4. Triggers the harness timeout handler.
 * 5. Verifies timeout handler terminates BOTH runner process group and independently detached server process group.
 * 6. Verifies complete recursive descendant hierarchy of runner (children, grandchildren) is terminated.
 * 7. Verifies complete recursive descendant hierarchy of server (children, grandchildren) is terminated.
 * 8. Verifies runner PID and runner process group have zero surviving processes.
 * 9. Verifies server PID and detached server process group have zero surviving processes.
 * 10. Verifies server port is released and immediately re-bindable by fresh TCP server.
 * 11. Regression Case 2: Proves lingering process detection fails observably with useful [Cleanup Failure] diagnostics.
 * 12. Regression Case 3: Proves frontend error handling does not broadly suppress ordinary application errors.
 */

async function runTimeoutCleanupRegressionTest() {
  console.log('\n=============================================================');
  console.log('ParandO Production Timeout-Cleanup Regression Test');
  console.log('Scope: LOCAL PRODUCTION-GRADE DELIVERY (Timeout-Path Cleanup)');
  console.log('=============================================================\n');

  let trackedRunnerPid: number | null = null;
  let trackedRunnerPgid: number | null = null;
  let trackedServerPid: number | null = null;
  let trackedServerPgid: number | null = null;
  let stubbornPid: number | null = null;
  let stubbornPgid: number | null = null;

  try {
    // -------------------------------------------------------------------------
    // Case 1: Forced-Timeout While Real Production Server Is Actively Running
    // -------------------------------------------------------------------------
    console.log('[Case 1/3] Spawning runner with SMOKE_HANG_AFTER_READY=1 and triggering harness timeout on readiness...');

    const result = await runSmokeWithHarness(
      { SMOKE_HANG_AFTER_READY: '1' },
      25000,
      '[CONTROLLED HANG TRIGGER]'
    );

    trackedRunnerPid = result.runnerPid;
    trackedRunnerPgid = result.runnerPgid;
    trackedServerPid = result.serverPid;
    trackedServerPgid = result.serverPgid || result.serverPid;

    console.log(`\nHarness completed in ${result.durationMs}ms`);
    console.log(`  TimedOut: ${result.timedOut}, CleanupError: ${result.cleanupError}`);
    console.log(`  Runner PID: ${result.runnerPid}, Runner PGID: ${result.runnerPgid}`);
    console.log(`  Server PID: ${result.serverPid}, Server PGID: ${result.serverPgid}`);
    console.log(`  Server Port: ${result.port}`);

    // Assertions for Case 1 harness execution
    assert(result.timedOut === true, 'Harness flagged timedOut === true (runner did not exit prematurely)');
    assert(result.cleanupError === null, `Timeout cleanup completed with zero errors (actual: ${result.cleanupError})`);
    assert(result.port !== null && typeof result.port === 'number', `Port was successfully extracted: ${result.port}`);
    assert(result.serverPid !== null && typeof result.serverPid === 'number', `Server PID was successfully extracted: ${result.serverPid}`);
    assert(result.runnerPid !== null && typeof result.runnerPid === 'number', `Runner PID was successfully retained: ${result.runnerPid}`);
    assert(result.runnerPgid !== null && typeof result.runnerPgid === 'number', `Runner PGID was successfully retained: ${result.runnerPgid}`);

    const port = result.port!;
    const serverPid = result.serverPid!;
    const serverPgid = result.serverPgid || serverPid;
    const runnerPid = result.runnerPid!;
    const runnerPgid = result.runnerPgid!;

    // Verify readiness happened before timeout
    assert(result.combined.includes('Production server successfully ready'), 'Server confirmed ready before timeout triggered');
    assert(result.combined.includes('[CONTROLLED HANG TRIGGER]'), 'Controlled hang trigger marker was logged');

    // -----------------------------------------------------------------------
    // Verify RUNNER OS process, process group, and descendant termination
    // -----------------------------------------------------------------------
    console.log('\n[Case 1/3] Verifying runner PID, runner process group, and runner descendants are completely terminated...');
    console.log(`  Checking runner PID ${runnerPid} OS status...`);
    const runnerDead = await waitForPidDead(runnerPid, 4000);
    assert(runnerDead, `Runner PID ${runnerPid} confirmed terminated within bounded interval`);
    assert(!isPidAlive(runnerPid), `Runner PID ${runnerPid} confirmed dead via process.kill(PID, 0) returning ESRCH`);
    console.log(`  ✓ Runner PID ${runnerPid} confirmed dead via process.kill(PID, 0) returning ESRCH`);

    if (process.platform === 'linux') {
      const runnerDescendants = getRecursiveDescendants(runnerPid);
      assert(
        runnerDescendants.length === 0,
        `No recursive descendants remain alive under runner PID ${runnerPid} (found: ${runnerDescendants.join(', ') || 'none'})`
      );
      console.log(`  ✓ No recursive descendants remain alive under runner PID ${runnerPid}`);

      const runnerGroupPids = getLinuxProcessGroupPids(runnerPgid);
      assert(
        runnerGroupPids.length === 0,
        `No surviving processes in runner process group PGID ${runnerPgid} (found: ${runnerGroupPids.join(', ') || 'none'})`
      );
      console.log(`  ✓ No surviving processes in runner process group PGID ${runnerPgid}`);

      const allRunnerTracked = await waitForProcessGroupEmpty(runnerPgid, runnerPid, 2000);
      assertZeroLingeringProcesses(allRunnerTracked, 'SmokeRunner');
      assert(allRunnerTracked.length === 0, 'Zero surviving processes across runner process group and descendant tree');
      console.log('  ✓ Zero surviving processes across runner process group and descendant tree');
    } else {
      console.log('  [Platform Notice] Non-Linux environment; verified runner dead via ESRCH signal probe.');
    }

    // -----------------------------------------------------------------------
    // Verify SERVER OS process, process group, and descendant termination
    // -----------------------------------------------------------------------
    console.log('\n[Case 1/3] Verifying server PID and detached server process group are completely terminated...');
    console.log(`  Checking server PID ${serverPid} OS status...`);
    const serverDead = await waitForPidDead(serverPid, 4000);
    assert(serverDead, `Server PID ${serverPid} confirmed terminated within bounded interval`);
    assert(!isPidAlive(serverPid), `Server PID ${serverPid} confirmed dead via process.kill(PID, 0) returning ESRCH`);
    console.log(`  ✓ Server PID ${serverPid} confirmed dead via process.kill(PID, 0) returning ESRCH`);

    if (process.platform === 'linux') {
      const serverDescendants = getRecursiveDescendants(serverPid);
      assert(
        serverDescendants.length === 0,
        `No recursive descendants remain alive under server PID ${serverPid} (found: ${serverDescendants.join(', ') || 'none'})`
      );
      console.log(`  ✓ No recursive descendants remain alive under server PID ${serverPid}`);

      const serverGroupPids = getLinuxProcessGroupPids(serverPgid);
      assert(
        serverGroupPids.length === 0,
        `No surviving processes in server process group PGID ${serverPgid} (found: ${serverGroupPids.join(', ') || 'none'})`
      );
      console.log(`  ✓ No surviving processes in server process group PGID ${serverPgid}`);

      const allServerTracked = await waitForProcessGroupEmpty(serverPgid, serverPid, 2000);
      assertZeroLingeringProcesses(allServerTracked, 'ProductionServer');
      assert(allServerTracked.length === 0, 'Zero surviving processes across server process group and descendant tree');
      console.log('  ✓ Zero surviving processes across server process group and descendant tree');
    } else {
      console.log('  [Platform Notice] Non-Linux environment; verified server dead via ESRCH signal probe.');
    }

    // -----------------------------------------------------------------------
    // Verify Port release and re-bindability
    // -----------------------------------------------------------------------
    console.log('\n[Case 1/3] Verifying port release and re-bindability...');
    await waitForPortFree(port, 4000);
    console.log(`  ✓ Port ${port} confirmed free via socket probe`);

    await verifyPortCanBeBound(port);
    console.log(`  ✓ Port ${port} confirmed successfully re-bindable by fresh TCP server`);

    // -------------------------------------------------------------------------
    // Case 2: Cleanup Failure Observability (Lingering Process Diagnostic)
    // -------------------------------------------------------------------------
    console.log('\n[Case 2/3] Verifying that lingering/unresponsive processes produce observable failure diagnostics...');

    // Spawn a stubborn child that traps SIGTERM to prove lingering process detection
    const stubborn = spawn(
      process.execPath,
      ['-e', 'process.on("SIGTERM", () => {}); console.log("TRAP_READY"); setInterval(() => {}, 500);'],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      }
    );

    stubbornPid = stubborn.pid!;
    stubbornPgid = stubbornPid;

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

    // Clean it up completely with escalation to SIGKILL
    const fullResult = await terminateProcessGroupGracefully(stubbornPgid, stubbornPid, 3000);
    assert(fullResult.success === true, 'Full cleanup escalated to SIGKILL and succeeded');
    assert(!isPidAlive(stubbornPid), 'Stubborn test process PID confirmed dead');
    stubbornPid = null;
    stubbornPgid = null;

    // -------------------------------------------------------------------------
    // Case 3: Frontend Error Suppression Audit & Observability Verification
    // -------------------------------------------------------------------------
    console.log('\n[Case 3/3] Verifying frontend error handling does not broadly suppress ordinary application errors...');

    const indexHtmlPath = path.resolve('index.html');
    const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

    // 1. Confirm that broad console.error override is NOT present
    assert(!indexHtmlContent.includes('origConsoleError'), 'index.html does not contain origConsoleError');
    assert(!indexHtmlContent.includes('console.error = function'), 'index.html does not override console.error');

    // 2. Confirm that global window.addEventListener('error') suppression is NOT present
    assert(!indexHtmlContent.includes("window.addEventListener('error'"), 'index.html does not attach global window error suppression listener');

    // 3. Confirm that ViteMockWebSocket is strictly scoped to 'vite-hmr'
    assert(indexHtmlContent.includes('ViteMockWebSocket'), 'index.html retains ViteMockWebSocket compatibility shim');
    assert(indexHtmlContent.includes("protocols === 'vite-hmr'"), 'ViteMockWebSocket strictly matches vite-hmr protocol');

    // 4. Test runtime unsuppressed error observability in a real VM context
    const vm = await import('vm');
    const loggedConsoleErrors: any[] = [];
    const fakeConsole = {
      ...console,
      error: (...args: any[]) => {
        loggedConsoleErrors.push(args);
      },
    };

    const match = indexHtmlContent.match(/<!--DEV_ONLY_SCRIPT_START-->\s*<script>([\s\S]*?)<\/script>\s*<!--DEV_ONLY_SCRIPT_END-->/);
    assert(match !== null, 'DEV_ONLY_SCRIPT block found in index.html');

    const scriptContent = match![1];
    const sandbox = {
      window: {
        WebSocket: class FakeWebSocket {
          url: string;
          protocols: any;
          constructor(u: string, p: any) { this.url = u; this.protocols = p; }
        },
      },
      console: fakeConsole,
      setTimeout,
      Array,
      String,
      typeof: (x: any) => typeof x,
    };

    vm.createContext(sandbox);
    vm.runInContext(scriptContent, sandbox);

    // Verify console.error was NOT overridden in sandbox and logs cleanly
    sandbox.console.error('Test application runtime error: Database connection failed', { code: 'ERR_DB' });
    assert(loggedConsoleErrors.length === 1, 'Standard application console.error calls are logged without suppression');
    assert(String(loggedConsoleErrors[0][0]).includes('Test application runtime error'), 'Error message was preserved intact');

    // Verify ViteMockWebSocket handles 'vite-hmr'
    const mockWs = new (sandbox.window.WebSocket as any)('ws://localhost:3000', 'vite-hmr');
    assert(mockWs.protocol === 'vite-hmr', 'ViteMockWebSocket handles vite-hmr protocol');

    // Verify ViteMockWebSocket delegates non-hmr connections
    const appWs = new (sandbox.window.WebSocket as any)('ws://localhost:3000/ws', ['app-protocol']);
    assert(appWs.protocols[0] === 'app-protocol', 'Non-HMR application WebSocket delegates to original WebSocket');
    console.log('  ✓ Verified ViteMockWebSocket strictly targets vite-hmr and does not suppress unrelated WebSockets or errors');

    console.log('\n=============================================================');
    console.log('TIMEOUT-CLEANUP REGRESSION TEST PASSED (100% SUCCESS)');
    console.log('=============================================================\n');
  } finally {
    // Final safety cleanup: ensure no orphaned server or runner survives if assertions fail mid-test
    let safetyCleanupError: string | null = null;

    if (trackedServerPgid && isPidAlive(trackedServerPgid)) {
      try {
        await terminateProcessGroupGracefully(trackedServerPgid, trackedServerPid || undefined, 2000);
      } catch (e: any) {
        safetyCleanupError = (safetyCleanupError ? safetyCleanupError + '; ' : '') + `Emergency server cleanup: ${e.message}`;
      }
    }

    if (trackedRunnerPgid && isPidAlive(trackedRunnerPgid)) {
      try {
        await terminateProcessGroupGracefully(trackedRunnerPgid, trackedRunnerPid || undefined, 2000);
      } catch (e: any) {
        safetyCleanupError = (safetyCleanupError ? safetyCleanupError + '; ' : '') + `Emergency runner cleanup: ${e.message}`;
      }
    }

    if (stubbornPid && isPidAlive(stubbornPid)) {
      try {
        await terminateProcessGroupGracefully(stubbornPgid || stubbornPid, stubbornPid, 2000);
      } catch (e: any) {
        safetyCleanupError = (safetyCleanupError ? safetyCleanupError + '; ' : '') + `Emergency stubborn cleanup: ${e.message}`;
      }
    }

    if (safetyCleanupError) {
      console.error(`[Emergency Cleanup Error] ${safetyCleanupError}`);
    }
  }
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
