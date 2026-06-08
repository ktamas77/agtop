'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const { parseEtime } = require('./format');

// Is this command line a Claude Code CLI session (not the desktop app / helpers)?
function isClaudeCli(args) {
  if (!args) return false;
  // The Electron desktop app and its helpers all live under Claude.app.
  if (args.includes('Claude.app')) return false;
  if (/Claude Helper|chrome-native-host|crashpad/.test(args)) return false;
  // The first token is the executable; accept it if its basename is exactly "claude",
  // or it's `node …/claude[.js]` (global npm install / local dev).
  const tokens = args.trim().split(/\s+/);
  const exe = tokens[0] || '';
  const base = exe.split('/').pop();
  if (base === 'claude') return true;
  if (/^node$/.test(base) || /\/node$/.test(exe)) {
    return tokens.slice(1).some((t) => {
      const b = t.split('/').pop();
      return b === 'claude' || (b === 'cli.js' && /claude/.test(t));
    });
  }
  return false;
}

// List running Claude CLI processes with pid, cpu, rss(KB), elapsed seconds, args.
function listClaudeProcesses() {
  let out;
  try {
    out = execFileSync('ps', ['-axww', '-o', 'pid=,pcpu=,rss=,etime=,args='], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (e) {
    return [];
  }
  const procs = [];
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(/^\s*(\d+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const [, pid, pcpu, rss, etime, args] = m;
    if (!isClaudeCli(args)) continue;
    procs.push({
      pid: parseInt(pid, 10),
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
function resolveCwds(procs) {
  if (procs.length === 0) return;
  if (process.platform === 'linux') {
    for (const p of procs) {
      try {
        p.cwd = fs.readlinkSync(`/proc/${p.pid}/cwd`);
      } catch (e) {
        /* process may have exited or be inaccessible */
      }
    }
    return;
  }
  // macOS / BSD: one batched lsof call for all pids.
  try {
    const pids = procs.map((p) => p.pid).join(',');
    const out = execFileSync('lsof', ['-a', '-p', pids, '-d', 'cwd', '-Fpn'], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    const byPid = new Map(procs.map((p) => [p.pid, p]));
    let cur = null;
    for (const line of out.split('\n')) {
      if (line[0] === 'p') cur = byPid.get(parseInt(line.slice(1), 10)) || null;
      else if (line[0] === 'n' && cur) cur.cwd = line.slice(1);
    }
  } catch (e) {
    /* lsof unavailable; cwd stays null and agents still show as "(unknown dir)" */
  }
}

module.exports = { listClaudeProcesses, resolveCwds, isClaudeCli };
