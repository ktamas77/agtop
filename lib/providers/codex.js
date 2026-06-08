'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { readTailObjects } = require('../jsonl');
const { firstLine, gitBranch: gitBranchOf } = require('../state');
const { exeBase } = require('../processes');

const name = 'codex';

// Friendly labels for Codex's tool names (mirrors how Claude tools read).
const TOOL_LABELS = {
  exec_command: 'Shell',
  shell: 'Shell',
  apply_patch: 'Edit',
  read_file: 'Read',
  write_file: 'Write',
  update_plan: 'Plan',
  web_search: 'WebSearch',
  view_image: 'Image',
};
const label = (n) => TOOL_LABELS[n] || n || 'tool';

// Is this command line an OpenAI Codex CLI session?
function matchProcess(args) {
  if (!args) return false;
  const tokens = args.trim().split(/\s+/);
  const base = exeBase(args);
  if (base === 'codex') return true;
  if (base === 'node' || /\/node$/.test(tokens[0] || '')) {
    return tokens.slice(1).some((t) => {
      const b = t.split('/').pop();
      return b === 'codex' || (b === 'cli.js' && /codex/.test(t));
    });
  }
  return false;
}

// Newest ~/.codex/state_*.sqlite (the session/thread store; the number bumps
// across schema migrations, so pick the most recently written one).
function statePath() {
  const dir = path.join(os.homedir(), '.codex');
  let best = null;
  let bestM = -1;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!/^state_\d+\.sqlite$/.test(f)) continue;
      const m = fs.statSync(path.join(dir, f)).mtimeMs;
      if (m > bestM) {
        bestM = m;
        best = path.join(dir, f);
      }
    }
  } catch (e) {
    /* no ~/.codex */
  }
  return best;
}

// Read recent non-archived threads via the system `sqlite3` binary (zero npm
// deps). Returns [] if sqlite3 / the DB is unavailable.
function queryThreads() {
  const db = statePath();
  if (!db) return [];
  const sql =
    'SELECT id, cwd, model, git_branch, cli_version, updated_at_ms, ' +
    'first_user_message, rollout_path FROM threads WHERE archived = 0 ' +
    'ORDER BY updated_at_ms DESC LIMIT 300;';
  try {
    const out = execFileSync('sqlite3', ['-readonly', '-json', db, sql], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 4000,
    });
    return out.trim() ? JSON.parse(out) : [];
  } catch (e) {
    return [];
  }
}

// Pull assistant text out of a Codex message/event payload.
function messageText(payload) {
  if (!payload) return '';
  if (typeof payload.message === 'string') return payload.message;
  if (Array.isArray(payload.content)) {
    const t = payload.content.find((c) => c && typeof c.text === 'string');
    if (t) return t.text;
  }
  if (typeof payload.last_agent_message === 'string') return payload.last_agent_message;
  return '';
}

// Derive activity from the last meaningful rollout item.
function deriveActivity(objs) {
  const meaningful = objs.filter(
    (o) => o && (o.type === 'response_item' || o.type === 'event_msg') && o.payload,
  );
  const last = meaningful[meaningful.length - 1];
  if (!last) return { rawState: 'unknown', detail: '' };
  const t = last.payload.type;
  if (t === 'function_call' || t === 'custom_tool_call') {
    return { rawState: 'tool', detail: label(last.payload.name) };
  }
  if (t === 'function_call_output' || t === 'custom_tool_call_output' || t === 'reasoning') {
    return { rawState: 'thinking', detail: '' };
  }
  if (t === 'task_started') return { rawState: 'thinking', detail: '' };
  if (t === 'message') {
    const isAssistant = last.payload.role === 'assistant';
    return {
      rawState: isAssistant ? 'replied' : 'thinking',
      detail: firstLine(messageText(last.payload)),
    };
  }
  if (t === 'agent_message' || t === 'task_complete') {
    return { rawState: 'replied', detail: firstLine(messageText(last.payload)) };
  }
  return { rawState: 'unknown', detail: '' };
}

// Summarize a rollout's tail: model + activity + last-activity time. Exposed for
// the rare rollout-only path and unit tests.
function summarizeTail(objs) {
  let model = null;
  let lastTs = null;
  for (const o of objs) {
    if (o.timestamp) lastTs = o.timestamp;
    if (o.type === 'turn_context' && o.payload && o.payload.model) model = o.payload.model;
  }
  return { model, lastTs: lastTs ? Date.parse(lastTs) : null, ...deriveActivity(objs) };
}

// Join matched Codex processes to their threads (by working dir), enriching
// activity from the thread's rollout file when it's readable.
function collect(procs) {
  const byCwd = new Map();
  for (const t of queryThreads()) {
    const arr = byCwd.get(t.cwd) || [];
    arr.push(t);
    byCwd.set(t.cwd, arr);
  }

  return procs.map((p) => {
    const pool = byCwd.get(p.cwd);
    const t = pool && pool.length ? pool.shift() : null;
    let model = null;
    let version = null;
    let lastTs = null;
    let lastPrompt = null;
    let sessionId = null;
    let rawState = 'no-session';
    let detail = '';
    let branch = null;

    if (t) {
      model = t.model || null;
      version = t.cli_version || null;
      lastTs = t.updated_at_ms || null;
      lastPrompt = t.first_user_message || null;
      sessionId = t.id || null;
      branch = t.git_branch || null;
      rawState = 'unknown'; // recency-based state unless the rollout tells us more
      if (t.rollout_path) {
        const tail = readTailObjects(t.rollout_path, 48 * 1024);
        if (tail.length) {
          const act = deriveActivity(tail);
          rawState = act.rawState;
          detail = act.detail;
        }
      }
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
      model,
      version,
      gitBranch: branch || gitBranchOf(p.cwd),
      sessionId,
      lastPrompt,
      lastTs,
      rawState,
      detail,
    };
  });
}

module.exports = { name, matchProcess, collect, summarizeTail };
