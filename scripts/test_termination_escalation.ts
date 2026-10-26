import { spawn, ChildProcess } from 'child_process';
import {
  terminateServerGracefully,
  isProcessAlive,
  registerChild,
  cleanupAllAsync,
  assert,
} from './production_smoke.js';

/**
 * Focused Process-Termination Escalation Regression Test
 *
 * Verifies:
 * 1. A process that ignores graceful SIGTERM triggers forced SIGKILL escalation.
 * 2. The escalation path does not check `child.killed` (which in Node.js is true after first signal).
 * 3. The process actually terminates under kernel SIGKILL and emits an exit event.
 * 4. Already-terminated processes do not hang or throw when passed to terminateServerGracefully.
 * 5. Bounded timeout prevents indefinite waiting.
 */

async function spawnStubbornChild(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['-e', 'process.on("SIGTERM", () => { /* ignore */ }); console.log("STUBBORN_READY"); setInterval(() => {}, 500);'],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      }
    );

    registerChild(child);

    const timer = setTimeout(() => {
      reject(new Error('Timeout waiting for stubborn child to report STUBBORN_READY'));
    }, 5000);

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
      reject(new Error(`Stubborn child exited prematurely with code ${code}, signal ${sig}`));
    });
  });
}

async function runEscalationRegressionTest() {
  console.log('\n=============================================================');
  console.log('ParandO Process-Termination Escalation Regression Test');
  console.log('=============================================================\n');

  // Case 1: Unresponsive process ignoring SIGTERM
  console.log('[Regression Test 1] Spawning unresponsive child (traps SIGTERM)...');
  const stubborn = await spawnStubbornChild();

  const pid = stubborn.pid;
  assert(typeof pid === 'number', `Spawned stubborn process PID ${pid}`);
  assert(isProcessAlive(stubborn), `Stubborn process is confirmed alive and signal handler ready`);

  console.log('[Regression Test 1] Terminating with SIGTERM (expecting escalation to SIGKILL)...');
  const startTime = Date.now();
  const result = await terminateServerGracefully(stubborn, 'SIGTERM', 3500);
  const duration = Date.now() - startTime;

  console.log(`[Regression Test 1] Terminated in ${duration}ms:`, result);
  assert(result.escalated === true, 'Termination result flagged escalated === true');
  assert(result.signal === 'SIGKILL', `Exit signal is SIGKILL (received: ${result.signal})`);
  assert(!isProcessAlive(stubborn), 'Process is confirmed dead in operating system');
  assert(duration >= 1000 && duration <= 4000, `Duration (${duration}ms) is within bounded escalation window`);

  // Case 2: Already-dead process
  console.log('\n[Regression Test 2] Testing termination of already-exited child...');
  const deadResult = await terminateServerGracefully(stubborn, 'SIGTERM', 2000);
  assert(deadResult.signal === 'SIGKILL', 'Already-dead process immediately returns recorded signal');
  assert(deadResult.escalated === false, 'Already-dead process returns escalated === false');

  console.log('\n=============================================================');
  console.log('ALL PROCESS ESCALATION REGRESSION TESTS PASSED (100% SUCCESS)');
  console.log('=============================================================\n');
}

runEscalationRegressionTest()
  .then(() => {
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\nESCALATION REGRESSION TEST FAILED:', err);
    try {
      await cleanupAllAsync(2000);
    } finally {
      process.exit(1);
    }
  });
