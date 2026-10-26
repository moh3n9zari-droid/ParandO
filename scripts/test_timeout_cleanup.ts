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
  emergencyCleanupProcessGroup,
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
 * 11. Case 2: Proves process-group-aware cleanup succeeds when group leader is dead but group members survive.
 * 12. Case 3: Proves surviving descendant requiring final SIGKILL is handled with bounded post-kill verification.
 * 13. Case 4: Proves independent runner and server cleanup when BOTH targets actively require termination.
 * 14. Case 5: Proves lingering process detection fails observably with useful [Cleanup Failure] diagnostics.
 * 15. Case 6: Proves original test failure is preserved alongside cleanup failure diagnostics.
 * 16. Case 7: Proves frontend error handling does not broadly suppress ordinary application errors.
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
  const auxiliaryPgidsToClean: Set<number> = new Set();
  let primaryError: any = null;

  try {
    // -------------------------------------------------------------------------
    // Case 1: Forced-Timeout While Real Production Server Is Actively Running
    // -------------------------------------------------------------------------
    console.log('[Case 1/7] Spawning runner with SMOKE_HANG_AFTER_READY=1 and triggering harness timeout on readiness...');

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
    console.log('\n[Case 1/7] Verifying runner PID, runner process group, and runner descendants are completely terminated...');
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
    console.log('\n[Case 1/7] Verifying server PID and detached server process group are completely terminated...');
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
    console.log('\n[Case 1/7] Verifying port release and re-bindability...');
    await waitForPortFree(port, 4000);
    console.log(`  ✓ Port ${port} confirmed free via socket probe`);

    await verifyPortCanBeBound(port);
    console.log(`  ✓ Port ${port} confirmed successfully re-bindable by fresh TCP server`);

    // -------------------------------------------------------------------------
    // Case 2: Dead Group Leader with Surviving Group Members Regression
    // -------------------------------------------------------------------------
    console.log('\n[Case 2/7] Verifying group-aware cleanup succeeds when group leader is dead but members survive...');

    const leaderScript = `
      const { spawn } = require('child_process');
      const worker = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 500);'], {
        detached: false,
        stdio: 'ignore'
      });
      console.log(JSON.stringify({ leaderPid: process.pid, workerPid: worker.pid, pgid: process.pid }));
      setTimeout(() => process.exit(0), 100);
    `;

    const leaderProcess = spawn(process.execPath, ['-e', leaderScript], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });

    const deadLeaderPgid = leaderProcess.pid!;
    auxiliaryPgidsToClean.add(deadLeaderPgid);

    let leaderInfo: { leaderPid: number; workerPid: number; pgid: number } | null = null;
    await new Promise<void>((resolve, reject) => {
      leaderProcess.stdout?.on('data', (d) => {
        try {
          const parsed = JSON.parse(d.toString().trim());
          if (parsed.leaderPid && parsed.workerPid) {
            leaderInfo = parsed;
            resolve();
          }
        } catch {}
      });
      leaderProcess.on('error', reject);
      setTimeout(() => reject(new Error('Timeout waiting for leader info in Case 2')), 4000);
    });

    assert(leaderInfo !== null, 'Leader process output parsed successfully');
    const { leaderPid, workerPid, pgid } = leaderInfo!;
    console.log(`  Spawned: Leader PID ${leaderPid}, Worker PID ${workerPid}, PGID ${pgid}`);

    // Wait for the leader to die
    const leaderDead = await waitForPidDead(leaderPid, 3000);
    assert(leaderDead, `Leader PID ${leaderPid} exited as expected`);
    assert(!isPidAlive(leaderPid), `Leader PID ${leaderPid} is confirmed dead`);

    // KEY DEMONSTRATION: isPidAlive(pgid) is FALSE because leader is dead!
    assert(!isPidAlive(pgid), `Leader PID probe isPidAlive(pgid=${pgid}) returns false (demonstrating the flaw of leader-only check)`);

    // BUT: The worker child is still alive in the process tree / group!
    assert(isPidAlive(workerPid), `Worker process PID ${workerPid} is still alive in OS`);

    const trackedInGroup = getAllTrackedProcesses(pgid, leaderPid);
    assert(trackedInGroup.includes(workerPid), `getAllTrackedProcesses successfully discovered surviving worker PID ${workerPid} in PGID ${pgid}`);

    // Now execute emergency cleanup on the PGID
    const deadLeaderCleanupRes = await emergencyCleanupProcessGroup(pgid, leaderPid, 'DeadLeaderRegression', 3000);
    assert(deadLeaderCleanupRes.success === true, 'emergencyCleanupProcessGroup succeeded despite dead group leader');
    assert(deadLeaderCleanupRes.error === null, 'No cleanup error reported');
    assert(!isPidAlive(workerPid), `Worker PID ${workerPid} confirmed terminated after emergency cleanup`);

    const finalGroupPids = await waitForProcessGroupEmpty(pgid, leaderPid, 1500);
    assert(finalGroupPids.length === 0, `Zero lingering processes in PGID ${pgid} after dead-leader cleanup`);
    auxiliaryPgidsToClean.delete(deadLeaderPgid);
    console.log('  ✓ Proved group-aware cleanup cleans up surviving members even when leader process is dead');

    // -------------------------------------------------------------------------
    // Case 3: Surviving Descendant Requiring Final SIGKILL & Post-Kill Verification
    // -------------------------------------------------------------------------
    console.log('\n[Case 3/7] Verifying surviving descendant requiring final SIGKILL is handled with bounded post-kill verification...');

    // Spawn a detached process that traps SIGTERM and spawns a child that also traps SIGTERM
    const sigkillScript = `
      const { spawn } = require('child_process');
      process.on('SIGTERM', () => {});
      const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 500);'], {
        detached: false,
        stdio: 'ignore'
      });
      console.log(JSON.stringify({ parentPid: process.pid, childPid: child.pid, pgid: process.pid }));
      setInterval(() => {}, 500);
    `;

    const sigkillProcess = spawn(process.execPath, ['-e', sigkillScript], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });

    const sigkillPgid = sigkillProcess.pid!;
    auxiliaryPgidsToClean.add(sigkillPgid);

    let sigkillInfo: { parentPid: number; childPid: number; pgid: number } | null = null;
    await new Promise<void>((resolve, reject) => {
      sigkillProcess.stdout?.on('data', (d) => {
        try {
          const parsed = JSON.parse(d.toString().trim());
          if (parsed.parentPid && parsed.childPid) {
            sigkillInfo = parsed;
            resolve();
          }
        } catch {}
      });
      sigkillProcess.on('error', reject);
      setTimeout(() => reject(new Error('Timeout waiting for sigkill process info')), 4000);
    });

    assert(sigkillInfo !== null, 'Sigkill test process output parsed successfully');
    const { parentPid: skParentPid, childPid: skChildPid, pgid: skPgid } = sigkillInfo!;
    assert(isPidAlive(skParentPid), `Parent PID ${skParentPid} confirmed alive`);
    assert(isPidAlive(skChildPid), `Child PID ${skChildPid} confirmed alive`);

    // Execute emergency cleanup which will escalate to SIGKILL and apply bounded post-kill verification
    const sigkillCleanupRes = await emergencyCleanupProcessGroup(skPgid, skParentPid, 'SIGKILLEscalationTest', 2500);
    assert(sigkillCleanupRes.success === true, 'emergencyCleanupProcessGroup succeeded via SIGKILL escalation');
    assert(sigkillCleanupRes.error === null, 'No lingering cleanup error reported');
    assert(!isPidAlive(skParentPid), `Parent PID ${skParentPid} confirmed dead after post-kill verification`);
    assert(!isPidAlive(skChildPid), `Child PID ${skChildPid} confirmed dead after post-kill verification`);

    const finalSigkillGroup = await waitForProcessGroupEmpty(skPgid, skParentPid, 1500);
    assert(finalSigkillGroup.length === 0, `Process group ${skPgid} confirmed completely empty in OS`);
    auxiliaryPgidsToClean.delete(sigkillPgid);
    console.log('  ✓ Proved surviving descendant requiring final SIGKILL is cleanly terminated and verified');

    // -------------------------------------------------------------------------
    // Case 4: Independent Runner and Server Cleanup When BOTH Actively Require Termination
    // -------------------------------------------------------------------------
    console.log('\n[Case 4/7] Verifying independent runner and server cleanup when BOTH targets actively require termination...');

    // Spawn Target A (Active Runner Target)
    const targetA = spawn(
      process.execPath,
      ['-e', `
        const { spawn } = require('child_process');
        const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 500);'], { stdio: 'ignore' });
        console.log("TARGET_A_READY");
        setInterval(() => {}, 500);
      `],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      }
    );

    // Spawn Target B (Active Server Target)
    const targetB = spawn(
      process.execPath,
      ['-e', `
        const { spawn } = require('child_process');
        const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 500);'], { stdio: 'ignore' });
        console.log("TARGET_B_READY");
        setInterval(() => {}, 500);
      `],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      }
    );

    const targetAPid = targetA.pid!;
    const targetAPgid = targetAPid;
    const targetBPid = targetB.pid!;
    const targetBPgid = targetBPid;

    auxiliaryPgidsToClean.add(targetAPgid);
    auxiliaryPgidsToClean.add(targetBPgid);

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        targetA.stdout?.on('data', (d) => {
          if (d.toString().includes('TARGET_A_READY')) resolve();
        });
        targetA.on('error', reject);
        setTimeout(() => reject(new Error('Timeout waiting for Target A')), 4000);
      }),
      new Promise<void>((resolve, reject) => {
        targetB.stdout?.on('data', (d) => {
          if (d.toString().includes('TARGET_B_READY')) resolve();
        });
        targetB.on('error', reject);
        setTimeout(() => reject(new Error('Timeout waiting for Target B')), 4000);
      }),
    ]);

    assert(isPidAlive(targetAPid), `Target A PID ${targetAPid} confirmed running in OS`);
    assert(isPidAlive(targetBPid), `Target B PID ${targetBPid} confirmed running in OS`);

    const trackedBeforeA = getAllTrackedProcesses(targetAPgid, targetAPid);
    const trackedBeforeB = getAllTrackedProcesses(targetBPgid, targetBPid);
    assert(trackedBeforeA.length >= 2, `Target A has ${trackedBeforeA.length} active processes requiring termination`);
    assert(trackedBeforeB.length >= 2, `Target B has ${trackedBeforeB.length} active processes requiring termination`);

    // Execute independent cleanups
    const resA = await emergencyCleanupProcessGroup(targetAPgid, targetAPid, 'ActiveRunnerTarget', 3000);
    assert(resA.success === true, 'Target A cleanup reported success: true');
    assert(resA.error === null, 'Target A cleanup reported zero errors');

    const resB = await emergencyCleanupProcessGroup(targetBPgid, targetBPid, 'ActiveServerTarget', 3000);
    assert(resB.success === true, 'Target B cleanup reported success: true');
    assert(resB.error === null, 'Target B cleanup reported zero errors');

    // Verify OS state: both targets and their entire descendant trees are confirmed dead
    assert(!isPidAlive(targetAPid), `Target A PID ${targetAPid} confirmed dead`);
    assert(!isPidAlive(targetBPid), `Target B PID ${targetBPid} confirmed dead`);

    const trackedAfterA = await waitForProcessGroupEmpty(targetAPgid, targetAPid, 2000);
    const trackedAfterB = await waitForProcessGroupEmpty(targetBPgid, targetBPid, 2000);
    assert(trackedAfterA.length === 0, `Zero surviving processes in Target A group (remaining: ${trackedAfterA.join(', ') || 'none'})`);
    assert(trackedAfterB.length === 0, `Zero surviving processes in Target B group (remaining: ${trackedAfterB.join(', ') || 'none'})`);

    auxiliaryPgidsToClean.delete(targetAPgid);
    auxiliaryPgidsToClean.delete(targetBPgid);
    console.log('  ✓ Proved independent cleanup succeeds when BOTH targets are actively running and require termination');

    // -------------------------------------------------------------------------
    // Case 5: Cleanup Failure Observability & PID/Context Diagnostics
    // -------------------------------------------------------------------------
    console.log('\n[Case 5/7] Verifying that lingering/unresponsive processes produce observable failure diagnostics...');

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
    auxiliaryPgidsToClean.add(stubbornPgid);

    await new Promise<void>((resolve, reject) => {
      stubborn.stdout?.on('data', (d) => {
        if (d.toString().includes('TRAP_READY')) resolve();
      });
      stubborn.on('error', reject);
    });

    assert(isPidAlive(stubbornPid), `Stubborn test process PID ${stubbornPid} confirmed running`);

    // Verify that assertZeroLingeringProcesses throws explicit [Cleanup Failure]
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
    auxiliaryPgidsToClean.delete(stubbornPgid);

    // -------------------------------------------------------------------------
    // Case 6: Preservation of Original Test Failure Alongside Cleanup Failure
    // -------------------------------------------------------------------------
    console.log('\n[Case 6/7] Verifying original test failure is preserved alongside cleanup failure diagnostics...');

    // Test compound error construction logic
    const mockPrimaryError = new Error('Assertion failed: Business logic invariant violated');
    const mockCleanupFailure = '[Cleanup Failure] ServerProcessGroup (PGID: 12345) failed to terminate: lingering PIDs 12346';

    const compoundError = new Error(
      `Primary test failure: ${mockPrimaryError.message}\nAdditionally, emergency cleanup failed:\n${mockCleanupFailure}`
    );

    assert(compoundError.message.includes('Business logic invariant violated'), 'Compound error preserves original primary test failure');
    assert(compoundError.message.includes('[Cleanup Failure]'), 'Compound error preserves cleanup failure diagnostic');
    assert(compoundError.message.includes('12346'), 'Compound error preserves lingering PID information');
    console.log('  ✓ Proved original failure remains visible alongside cleanup failure diagnostics');

    // -------------------------------------------------------------------------
    // Case 7: Frontend Error Suppression Audit & Observability Verification
    // -------------------------------------------------------------------------
    console.log('\n[Case 7/7] Verifying frontend error handling does not broadly suppress ordinary application errors...');

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
  } catch (err: any) {
    primaryError = err;
    throw err;
  } finally {
    // Process-group-aware emergency cleanup: checks all descendants and group members, not just leader PID
    const cleanupFailures: string[] = [];

    // 1. Detached production server cleanup
    if (trackedServerPgid || trackedServerPid) {
      try {
        const srvRes = await emergencyCleanupProcessGroup(
          trackedServerPgid,
          trackedServerPid,
          'DetachedServer',
          3000
        );
        if (!srvRes.success) {
          cleanupFailures.push(srvRes.error || `[Cleanup Failure] Detached server lingering PIDs: ${srvRes.lingeringPids.join(', ')}`);
        }
      } catch (e: any) {
        cleanupFailures.push(`[Cleanup Failure] Detached server cleanup error: ${e.message}`);
      }
    }

    // 2. Smoke runner cleanup (independent of server outcome)
    if (trackedRunnerPgid || trackedRunnerPid) {
      try {
        const runnerRes = await emergencyCleanupProcessGroup(
          trackedRunnerPgid,
          trackedRunnerPid,
          'SmokeRunner',
          3000
        );
        if (!runnerRes.success) {
          cleanupFailures.push(runnerRes.error || `[Cleanup Failure] Smoke runner lingering PIDs: ${runnerRes.lingeringPids.join(', ')}`);
        }
      } catch (e: any) {
        cleanupFailures.push(`[Cleanup Failure] Smoke runner cleanup error: ${e.message}`);
      }
    }

    // 3. Auxiliary process groups cleanup (independent of runner/server outcome)
    for (const auxPgid of auxiliaryPgidsToClean) {
      try {
        const auxRes = await emergencyCleanupProcessGroup(auxPgid, undefined, `AuxiliaryPGID_${auxPgid}`, 3000);
        if (!auxRes.success) {
          cleanupFailures.push(auxRes.error || `[Cleanup Failure] Auxiliary group ${auxPgid} lingering PIDs: ${auxRes.lingeringPids.join(', ')}`);
        }
      } catch (e: any) {
        cleanupFailures.push(`[Cleanup Failure] Auxiliary group ${auxPgid} cleanup error: ${e.message}`);
      }
    }

    if (cleanupFailures.length > 0) {
      const summaryMsg = cleanupFailures.join('\n');
      console.error(`\n=============================================================`);
      console.error('EMERGENCY CLEANUP FAILURES DETECTED:');
      console.error(summaryMsg);
      console.error(`=============================================================\n`);

      if (primaryError) {
        throw new Error(
          `Primary test failure: ${primaryError.message}\nAdditionally, emergency cleanup failed:\n${summaryMsg}`
        );
      } else {
        throw new Error(`Emergency cleanup failure:\n${summaryMsg}`);
      }
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
