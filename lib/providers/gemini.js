'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readTailObjects } = require('../jsonl');
const { firstLine, gitBranch: gitBranchOf } = require('../state');
const { exeBase } = require('../processes');

const name = 'gemini';

// Friendly labels for Gemini's tool names (mirrors how Claude tools read).
const TOOL_LABELS = {
  run_shell_command: 'Shell',
  replace: 'Edit',
  write_file: 'Write',
  read_file: 'Read',
  read_many_files: 'Read',
  google_web_search: 'WebSearch',
  web_fetch: 'Fetch',
  glob: 'Glob',
  search_file_content: 'Grep',
  save_memory: 'Memory',
};
const label = (n) => TOOL_LABELS[n] || n || 'tool';

// Is this command line a Google Gemini CLI session? It runs as `node …/gemini`.
function matchProcess(args) {
  if (!args) return false;
  const tokens = args.trim().split(/\s+/);
  const base = exeBase(args);
  if (base === 'gemini') return true;
  if (base === 'node' || /\/node$/.test(tokens[0] || '')) {
    return tokens.slice(1).some((t) => {
      const b = t.split('/').pop();
      return b === 'gemini' || (b === 'cli.js' && /gemini/.test(t));
    });
  }
  return false;
}

function geminiHome() {
  return path.join(os.homedir(), '.gemini');
}

// Gemini keys chat storage by a per-project name (basename), mapped from the
// full cwd in ~/.gemini/projects.json.
function projectName(cwd) {
  try {
    const map = JSON.parse(fs.readFileSync(path.join(geminiHome(), 'projects.json'), 'utf8'));
    if (map && map.projects && map.projects[cwd]) return map.projects[cwd];
  } catch (e) {
    /* fall through to basename */
  }
  return path.basename(cwd);
}

// Chat session files for a cwd, newest first.
function listSessions(cwd) {
  const dir = path.join(geminiHome(), 'tmp', projectName(cwd), 'chats');
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (e) {
    return [];
  }
  const out = [];
  for (const f of entries) {
    if (!f.startsWith('session-') || !f.endsWith('.jsonl')) continue;
    const full = path.join(dir, f);
    try {
      out.push({ file: full, mtimeMs: fs.statSync(full).mtimeMs });
    } catch (e) {
      /* skip */
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

// Derive activity from the last real (user/gemini) message in the transcript.
function deriveActivity(objs) {
  const typed = objs.filter((o) => o && (o.type === 'user' || o.type === 'gemini'));
  const last = typed[typed.length - 1];
  if (!last) return { rawState: 'unknown', detail: '' };
  if (last.type === 'user')
    return { rawState: 'thinking', detail: firstLine(last.message || last.content) };
  const hasContent = last.content && String(last.content).trim();
  if (!hasContent && Array.isArray(last.toolCalls) && last.toolCalls.length) {
    return { rawState: 'tool', detail: label(last.toolCalls[last.toolCalls.length - 1].name) };
  }
  return { rawState: 'replied', detail: firstLine(last.content) };
}

// Summarize a chat session file (model + activity + last-activity time).
function summarize(file) {
  const objs = readTailObjects(file, 32 * 1024);
  let model = null;
  let lastTs = null;
  let sessionId = null;
  for (const o of objs) {
    if (o.model) model = o.model;
    if (o.sessionId) sessionId = o.sessionId;
    const ts = o.timestamp || o.lastUpdated || (o.$set && o.$set.lastUpdated);
    if (ts) {
      const ms = Date.parse(ts);
      if (!isNaN(ms) && (lastTs == null || ms > lastTs)) lastTs = ms;
    }
  }
  return { model, lastTs, sessionId, ...deriveActivity(objs) };
}

// Join matched Gemini processes to their chat sessions (by working dir).
function collect(procs) {
  const poolByCwd = new Map();
  const pool = (cwd) => {
    if (!poolByCwd.has(cwd)) poolByCwd.set(cwd, listSessions(cwd));
    return poolByCwd.get(cwd);
  };

  return procs.map((p) => {
    let s = null;
    if (p.cwd) {
      const sessions = pool(p.cwd);
      if (sessions.length) s = summarize(sessions.shift().file);
    }
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
      version: null,
      gitBranch: gitBranchOf(p.cwd),
      sessionId: s ? s.sessionId : null,
      lastPrompt: null,
      lastTs: s ? s.lastTs : null,
      rawState: s ? s.rawState : 'no-session',
      detail: s ? s.detail : '',
    };
  });
}

module.exports = { name, matchProcess, collect, summarize, deriveActivity };
