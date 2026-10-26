import fs from 'fs';
import net from 'net';
import { execSync } from 'child_process';

/**
 * Process Tree & Process Group Inspection and Termination Utilities
 *
 * Implements strict POSIX/Linux process tree inspection and termination:
 * 1. Reads `/proc/[pid]/stat` to parse process group (PGRP) and parent PID (PPID).
 * 2. Recursively collects all direct and indirect descendants (children, grandchildren, etc.).
 * 3. Collects all processes belonging to a given Process Group ID (PGID).
 * 4. Gracefully signals and escalates to SIGKILL with bounded timeout for process groups.
 * 5. Verifies TCP port release and re-bindability.
 */

export function isPidAlive(pid: number): boolean {
  if (!pid || pid <= 0 || isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return false;
  }
}

/**
 * Safely parse PGRP and PPID from Linux /proc/[pid]/stat.
 * Format: pid (comm) state ppid pgrp ...
 * Notice: comm can contain spaces and parentheses, so we find the last ')' to parse fields after it.
 */
export function getProcStatInfo(pid: number): { ppid: number; pgrp: number; state: string } | null {
  if (process.platform !== 'linux' || !fs.existsSync('/proc')) {
    return null;
  }
  try {
    const statPath = `/proc/${pid}/stat`;
    if (!fs.existsSync(statPath)) return null;
    const content = fs.readFileSync(statPath, 'utf8');
    const lastParen = content.lastIndexOf(')');
    if (lastParen === -1) return null;
    const fields = content.substring(lastParen + 1).trim().split(/\s+/);
    if (fields.length < 3) return null;
    // fields[0] = state
    // fields[1] = ppid
    // fields[2] = pgrp
    const state = fields[0];
    const ppid = parseInt(fields[1], 10);
    const pgrp = parseInt(fields[2], 10);
    return { ppid, pgrp, state };
  } catch {
    return null;
  }
}

/**
 * Returns all process IDs belonging to a given PGID on Linux.
 */
export function getLinuxProcessGroupPids(pgid: number): number[] {
  if (process.platform !== 'linux' || !fs.existsSync('/proc') || !pgid || pgid <= 1) {
    return [];
  }
  const matchingPids = new Set<number>();
  try {
    const entries = fs.readdirSync('/proc');
    for (const entry of entries) {
      if (!/^\d+$/.test(entry)) continue;
      const pid = parseInt(entry, 10);
      const stat = getProcStatInfo(pid);
      if (stat && stat.pgrp === pgid) {
        matchingPids.add(pid);
      }
    }
  } catch {}

  // Cross-check with ps command if available
  try {
    const psOut = execSync('ps -eo pid,pgid', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = psOut.trim().split('\n');
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length >= 2) {
        const p = parseInt(parts[0], 10);
        const g = parseInt(parts[1], 10);
        if (g === pgid && isPidAlive(p)) {
          matchingPids.add(p);
        }
      }
    }
  } catch {}

  return Array.from(matchingPids).filter((pid) => isPidAlive(pid));
}

/**
 * Recursively find all descendants (children, grandchildren, etc.) of rootPid on Linux.
 */
export function getRecursiveDescendants(rootPid: number): number[] {
  if (process.platform !== 'linux' || !fs.existsSync('/proc') || !rootPid || rootPid <= 1) {
    return [];
  }
  const parentToChildren = new Map<number, number[]>();

  try {
    const entries = fs.readdirSync('/proc');
    for (const entry of entries) {
      if (!/^\d+$/.test(entry)) continue;
      const pid = parseInt(entry, 10);
      const stat = getProcStatInfo(pid);
      if (stat) {
        const list = parentToChildren.get(stat.ppid) || [];
        list.push(pid);
        parentToChildren.set(stat.ppid, list);
      }
    }
  } catch {}

  // Cross-check with ps command
  try {
    const psOut = execSync('ps -eo pid,ppid', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = psOut.trim().split('\n');
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length >= 2) {
        const p = parseInt(parts[0], 10);
        const pp = parseInt(parts[1], 10);
        const list = parentToChildren.get(pp) || [];
        if (!list.includes(p)) {
          list.push(p);
          parentToChildren.set(pp, list);
        }
      }
    }
  } catch {}

  // Breadth-first search from rootPid
  const descendants = new Set<number>();
  const queue: number[] = [rootPid];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = parentToChildren.get(current) || [];
    for (const child of children) {
      if (!descendants.has(child)) {
        descendants.add(child);
        queue.push(child);
      }
    }
  }

  return Array.from(descendants).filter((pid) => isPidAlive(pid));
}

/**
 * Returns all active processes belonging either to process group `pgid`
 * OR recursively descended from `rootPid`.
 */
export function getAllTrackedProcesses(pgid?: number, rootPid?: number): number[] {
  const pids = new Set<number>();
  if (rootPid && isPidAlive(rootPid)) {
    pids.add(rootPid);
  }
  if (pgid && pgid > 1) {
    const groupPids = getLinuxProcessGroupPids(pgid);
    for (const p of groupPids) pids.add(p);
  }
  if (rootPid && rootPid > 1) {
    const descPids = getRecursiveDescendants(rootPid);
    for (const p of descPids) pids.add(p);
  }
  return Array.from(pids).filter((p) => isPidAlive(p));
}

/**
 * Gracefully terminates a process group with bounded timeout and escalation to SIGKILL.
 * Guaranteed to probe the OS until all processes have exited.
 */
export async function terminateProcessGroupGracefully(
  pgid: number,
  rootPid?: number,
  timeoutMs = 4000
): Promise<{ success: boolean; lingeringPids: number[] }> {
  const targetPgid = pgid > 1 ? pgid : rootPid || 0;
  if (!targetPgid || targetPgid <= 1) {
    return { success: true, lingeringPids: [] };
  }

  const initialPids = getAllTrackedProcesses(targetPgid, rootPid);
  if (initialPids.length === 0) {
    return { success: true, lingeringPids: [] };
  }

  // 1. Dispatch graceful SIGTERM to process group and individual PIDs
  if (process.platform !== 'win32') {
    try {
      process.kill(-targetPgid, 'SIGTERM');
    } catch {}
  }
  for (const pid of initialPids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }

  // 2. Poll during graceful window (up to 50% of timeoutMs)
  const gracefulDelay = Math.min(Math.floor(timeoutMs * 0.5), 2000);
  const startTime = Date.now();

  while (Date.now() - startTime < gracefulDelay) {
    const remaining = getAllTrackedProcesses(targetPgid, rootPid);
    if (remaining.length === 0) {
      return { success: true, lingeringPids: [] };
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  // 3. Escalate to SIGKILL for any remaining processes
  if (process.platform !== 'win32') {
    try {
      process.kill(-targetPgid, 'SIGKILL');
    } catch {}
  }
  const lingeringBeforeKill = getAllTrackedProcesses(targetPgid, rootPid);
  for (const pid of lingeringBeforeKill) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  }

  // 4. Poll until timeoutMs
  while (Date.now() - startTime < timeoutMs) {
    const remaining = getAllTrackedProcesses(targetPgid, rootPid);
    if (remaining.length === 0) {
      return { success: true, lingeringPids: [] };
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  const finalLingering = getAllTrackedProcesses(targetPgid, rootPid);
  return {
    success: finalLingering.length === 0,
    lingeringPids: finalLingering,
  };
}

/**
 * Enforces zero surviving processes and throws an explicit [Cleanup Failure] error
 * if any tracked PID remains alive.
 */
export function assertZeroLingeringProcesses(pids: number[], context = 'Process'): void {
  const surviving = pids.filter((p) => isPidAlive(p));
  if (surviving.length > 0) {
    const errorMsg = `[Cleanup Failure] ${context} failed to terminate processes within bounded interval: lingering PIDs ${surviving.join(', ')}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Actively verify that a TCP port can be bound by a fresh server.
 */
export async function verifyPortCanBeBound(port: number): Promise<void> {
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

/**
 * Asynchronously waits for a PID to terminate with a bounded polling timeout.
 * Accounts for asynchronous OS kernel process reaping.
 */
export async function waitForPidDead(pid: number, timeoutMs = 3000): Promise<boolean> {
  if (!isPidAlive(pid)) return true;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isPidAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return !isPidAlive(pid);
}

/**
 * Asynchronously waits for a process group and descendants to become empty
 * with a bounded polling timeout. Returns remaining PIDs if any linger.
 */
export async function waitForProcessGroupEmpty(
  pgid: number,
  rootPid?: number,
  timeoutMs = 3000
): Promise<number[]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const remaining = getAllTrackedProcesses(pgid, rootPid);
    if (remaining.length === 0) return [];
    await new Promise((r) => setTimeout(r, 50));
  }
  return getAllTrackedProcesses(pgid, rootPid);
}

/**
 * Emergency process group cleanup.
 * Group-aware and descendant-aware: inspects all tracked processes in PGID and rootPid,
 * even if the group leader process has already exited.
 * Evaluates graceful-cleanup outcome, escalates to final SIGKILL with bounded post-kill verification,
 * and returns a structured report verified against OS state.
 */
export async function emergencyCleanupProcessGroup(
  pgid?: number | null,
  rootPid?: number | null,
  context = 'ProcessGroup',
  timeoutMs = 3500
): Promise<{ success: boolean; lingeringPids: number[]; error: string | null }> {
  const targetPgid = pgid && pgid > 1 ? pgid : rootPid && rootPid > 1 ? rootPid : 0;
  if (!targetPgid && (!rootPid || rootPid <= 1)) {
    return { success: true, lingeringPids: [], error: null };
  }

  // 1. Identify all currently surviving processes in PGID or descendant tree
  const activePids = getAllTrackedProcesses(targetPgid || undefined, rootPid || undefined);
  if (activePids.length === 0) {
    return { success: true, lingeringPids: [], error: null };
  }

  // 2. Perform graceful termination with escalation to SIGKILL
  const termRes = await terminateProcessGroupGracefully(targetPgid, rootPid || undefined, timeoutMs);

  // 3. Explicitly evaluate the result of terminateProcessGroupGracefully
  let gracefulFailureContext = '';
  if (!termRes.success) {
    gracefulFailureContext = `Graceful termination failed within ${timeoutMs}ms: lingering PIDs ${termRes.lingeringPids.join(', ')}`;
  }

  // 4. Actively verify process group and descendants are empty
  let remaining = await waitForProcessGroupEmpty(targetPgid, rootPid || undefined, 1500);

  // 5. If processes still linger after graceful termination and initial verification,
  // execute targeted final SIGKILL on each remaining PID and process group
  if (remaining.length > 0 || !termRes.success) {
    const pidsToKill = remaining.length > 0 ? remaining : termRes.lingeringPids;
    if (process.platform !== 'win32' && targetPgid > 1) {
      try {
        process.kill(-targetPgid, 'SIGKILL');
      } catch {}
    }
    for (const pid of pidsToKill) {
      if (isPidAlive(pid)) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {}
      }
    }

    // 6. CRITICAL: Bounded post-kill verification interval (polling OS state until empty or timeout)
    remaining = await waitForProcessGroupEmpty(targetPgid, rootPid || undefined, 2000);
  }

  // 7. Final OS-level verification
  const finalCheck = getAllTrackedProcesses(targetPgid || undefined, rootPid || undefined);
  if (finalCheck.length > 0) {
    const failureDetails = gracefulFailureContext ? ` [${gracefulFailureContext}]` : '';
    const errorMsg = `[Cleanup Failure] ${context} (PGID: ${targetPgid}, PID: ${rootPid ?? 'n/a'}) failed to terminate: lingering PIDs ${finalCheck.join(', ')}${failureDetails}`;
    return {
      success: false,
      lingeringPids: finalCheck,
      error: errorMsg,
    };
  }

  return {
    success: true,
    lingeringPids: [],
    error: null,
  };
}



