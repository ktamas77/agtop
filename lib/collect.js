'use strict';

const path = require('path');
const { listClaudeProcesses, resolveCwds } = require('./processes');
const { listSessionFiles, readTailObjects, summarizeSession } = require('./sessions');

const MAX_SESSION_SCAN = 120; // cap transcript reads per refresh

// Build the list of running-agent records by joining live processes to their
// most recent matching session transcript (matched on working directory).
function collectAgents() {
  const procs = listClaudeProcesses();
  resolveCwds(procs);

  // How many running processes live in each cwd (handles >1 agent per dir).
  const needByCwd = new Map();
  for (const p of procs) {
    if (!p.cwd) continue;
    needByCwd.set(p.cwd, (needByCwd.get(p.cwd) || 0) + 1);
  }

  // Walk sessions newest-first; collect candidate session summaries per cwd,
  // up to the number of processes that actually live there.
  const sessionsByCwd = new Map(); // cwd -> [summary, ...] newest first
  const files = listSessionFiles();
  let scanned = 0;
  for (const f of files) {
    if (needByCwd.size === 0) break;
    if (scanned >= MAX_SESSION_SCAN) break;
    scanned++;
    const objs = readTailObjects(f.file);
    if (!objs.length) continue;
    const sum = summarizeSession(objs);
    if (!sum.cwd || !needByCwd.has(sum.cwd)) continue;
    const arr = sessionsByCwd.get(sum.cwd) || [];
    if (arr.length >= needByCwd.get(sum.cwd)) continue;
    sum.sessionId = f.sessionId;
    sum.mtimeMs = f.mtimeMs;
    arr.push(sum);
    sessionsByCwd.set(sum.cwd, arr);
  }

  const now = Date.now();
  const agents = procs.map((p) => {
    const pool = sessionsByCwd.get(p.cwd);
    const session = pool && pool.length ? pool.shift() : null;
    const lastTs = session && session.lastTs ? session.lastTs : null;
    const idleSec = lastTs ? Math.max(0, (now - lastTs) / 1000) : null;
    return {
      pid: p.pid,
      cpu: p.cpu,
      rssKb: p.rssKb,
      uptimeSec: p.uptimeSec,
      cwd: p.cwd,
      project: p.cwd ? path.basename(p.cwd) : '(unknown)',
      args: p.args,
      model: session ? session.model : null,
      version: session ? session.version : null,
      gitBranch: session ? session.gitBranch : null,
      sessionId: session ? session.sessionId : null,
      lastPrompt: session ? session.lastPrompt : null,
      rawState: session ? session.state : 'no-session',
      detail: session ? session.detail : '',
      idleSec,
      state: classifyState(session ? session.state : 'no-session', idleSec),
    };
  });

  return agents;
}

// Combine transcript activity with how long ago it happened into a display state.
function classifyState(rawState, idleSec) {
  if (rawState === 'no-session') return 'live';
  if (idleSec == null) return 'idle';
  if (rawState === 'tool') return idleSec < 120 ? 'working' : 'stalled';
  if (rawState === 'thinking') return idleSec < 120 ? 'thinking' : 'stalled';
  if (rawState === 'replied') return idleSec < 30 ? 'replied' : 'waiting';
  return idleSec < 30 ? 'active' : 'idle';
}

module.exports = { collectAgents };
