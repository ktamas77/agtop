import fs from 'node:fs';
import { parseEtime } from './format.ts';
import { capture, osName } from './platform.ts';
import type { Proc } from './types.ts';

// List every running process with pid, ppid, cpu, rss(KB), elapsed seconds, and
// full args. Providers filter this list with their own matchers, so `ps` runs once.
export function listAllProcesses(): Proc[] {
  const out = capture('ps', ['-axww', '-o', 'pid=,ppid=,pcpu=,rss=,etime=,args=']);
  const procs: Proc[] = [];
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const [, pid, ppid, pcpu, rss, etime, args] = m;
    procs.push({
      pid: parseInt(pid, 10),
      ppid: parseInt(ppid, 10),
      cpu: parseFloat(pcpu),
      rssKb: parseInt(rss, 10),
      uptimeSec: parseEtime(etime),
      args: args.trim(),
      cwd: null,
    });
  }
  return procs;
}

// Resolve current working directory for each pid. Uses /proc on Linux, lsof on macOS.
export function resolveCwds(procs: Proc[]): void {
  if (procs.length === 0) return;
  if (osName() === 'linux') {
    for (const p of procs) {
      try {
        p.cwd = fs.readlinkSync(`/proc/${p.pid}/cwd`);
      } catch {
        /* process may have exited or be inaccessible */
      }
    }
    return;
  }
  // macOS / BSD: one batched lsof call for all pids.
  const pids = procs.map((p) => p.pid).join(',');
  const out = capture('lsof', ['-a', '-p', pids, '-d', 'cwd', '-Fpn']);
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  let cur: Proc | null = null;
  for (const line of out.split('\n')) {
    if (line[0] === 'p') cur = byPid.get(parseInt(line.slice(1), 10)) || null;
    else if (line[0] === 'n' && cur) cur.cwd = line.slice(1);
  }
}

// Basename of the executable in a process's args string.
export function exeBase(args: string): string {
  const exe = (args || '').trim().split(/\s+/)[0] || '';
  return exe.split('/').pop() || '';
}
