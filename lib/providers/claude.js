'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readTailObjects } = require('../jsonl');
const { firstLine } = require('../state');
const { exeBase } = require('../processes');

const name = 'claude';
const MAX_SESSION_SCAN = 120;

// Is this command line a Claude Code CLI session (not the desktop app / helpers)?
function matchProcess(args) {
  if (!args) return false;
  if (args.includes('Claude.app')) return false;
  if (/Claude Helper|chrome-native-host|crashpad/.test(args)) return false;
  const tokens = args.trim().split(/\s+/);
  const base = exeBase(args);
  if (base === 'claude') return true;
  if (base === 'node' || /\/node$/.test(tokens[0] || '')) {
    return tokens.slice(1).some((t) => {
      const b = t.split('/').pop();
      return b === 'claude' || (b === 'cli.js' && /claude/.test(t));
    });
  }
  return false;
}

function projectsRoot() {
  return path.join(os.homedir(), '.claude', 'projects');
}

// Every Claude session transcript across all projects, newest first.
function listSessionFiles() {
  const root = projectsRoot();
  let dirs;
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true });
  } catch (e) {
    return [];
  }
  const files = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const dir = path.join(root, d.name);
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch (e) {
      continue;
    }
    for (const fname of entries) {
      if (!fname.endsWith('.jsonl')) continue;
      const file = path.join(dir, fname);
      try {
        const st = fs.statSync(file);
        files.push({ file, mtimeMs: st.mtimeMs, sessionId: fname.replace(/\.jsonl$/, '') });
      } catch (e) {
        /* skip */
      }
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files;
}

// Classify what the agent is doing from the last meaningful transcript entry.
function deriveActivity(last) {
  if (!last) return { rawState: 'unknown', detail: '' };
  if (last.type === 'assistant' && last.message) {
    const content = Array.isArray(last.message.content) ? last.message.content : [];
    const tools = content.filter((b) => b && b.type === 'tool_use').map((b) => b.name);
    if (tools.length) return { rawState: 'tool', detail: tools.join(', ') };
    const text = content.find((b) => b && b.type === 'text');
    return { rawState: 'replied', detail: text ? firstLine(text.text) : '' };
  }
  if (last.type === 'user' && last.message) {
    const content = last.message.content;
    if (Array.isArray(content) && content.some((b) => b && b.type === 'tool_result')) {
      return { rawState: 'thinking', detail: '' };
    }
    return { rawState: 'thinking', detail: firstLine(typeof content === 'string' ? content : '') };
  }
  return { rawState: 'unknown', detail: '' };
}

// Summarize a session from its tail objects.
function summarize(objs) {
  let cwd = null;
  let model = null;
  let version = null;
  let gitBranch = null;
  let lastTs = null;
  let lastPrompt = null;
  for (const o of objs) {
    if (o.cwd) cwd = o.cwd;
    if (o.version) version = o.version;
    if (o.gitBranch) gitBranch = o.gitBranch;
    if (o.timestamp) lastTs = o.timestamp;
    if (o.type === 'assistant' && o.message && o.message.model) model = o.message.model;
    if (o.type === 'last-prompt' && o.lastPrompt) lastPrompt = o.lastPrompt;
  }
  const last = objs.length ? objs[objs.length - 1] : null;
  const act = deriveActivity(last);
  return {
    cwd,
    model,
    version,
    gitBranch,
    lastTs: lastTs ? Date.parse(lastTs) : null,
    lastPrompt,
    rawState: act.rawState,
    detail: act.detail,
  };
}

// Join matched Claude processes to their session transcripts (by working dir).
function collect(procs) {
  const needByCwd = new Map();
  for (const p of procs) {
    if (p.cwd) needByCwd.set(p.cwd, (needByCwd.get(p.cwd) || 0) + 1);
  }
  const sessionsByCwd = new Map();
  let scanned = 0;
  for (const f of listSessionFiles()) {
    if (needByCwd.size === 0 || scanned >= MAX_SESSION_SCAN) break;
    scanned++;
    const objs = readTailObjects(f.file);
    if (!objs.length) continue;
    const sum = summarize(objs);
    if (!sum.cwd || !needByCwd.has(sum.cwd)) continue;
    const arr = sessionsByCwd.get(sum.cwd) || [];
    if (arr.length >= needByCwd.get(sum.cwd)) continue;
    sum.sessionId = f.sessionId;
    arr.push(sum);
    sessionsByCwd.set(sum.cwd, arr);
  }

  return procs.map((p) => {
    const pool = sessionsByCwd.get(p.cwd);
    const s = pool && pool.length ? pool.shift() : null;
    return {
      agent: name,
      pid: p.pid,
      cpu: p.cpu,
      rssKb: p.rssKb,
      uptimeSec: p.uptimeSec,
      cwd: p.cwd,
      project: p.cwd ? path.basename(p.cwd) : '(unknown)',
      args: p.args,
      model: s ? s.model : null,
      version: s ? s.version : null,
      gitBranch: s ? s.gitBranch : null,
      sessionId: s ? s.sessionId : null,
      lastPrompt: s ? s.lastPrompt : null,
      lastTs: s ? s.lastTs : null,
      rawState: s ? s.rawState : 'no-session',
      detail: s ? s.detail : '',
    };
  });
}

module.exports = { name, matchProcess, collect, summarize, listSessionFiles, projectsRoot };
