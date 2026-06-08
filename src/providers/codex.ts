import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readTailObjects } from '../jsonl.ts';
import { firstLine, gitBranch as gitBranchOf } from '../state.ts';
import { exeBase } from '../processes.ts';
import { capture } from '../platform.ts';
import type { Activity, PartialAgent, Proc, Rec } from '../types.ts';

export const name = 'codex' as const;

// Friendly labels for Codex's tool names (mirrors how Claude tools read).
const TOOL_LABELS: Record<string, string> = {
  exec_command: 'Shell',
  shell: 'Shell',
  apply_patch: 'Edit',
  read_file: 'Read',
  write_file: 'Write',
  update_plan: 'Plan',
  web_search: 'WebSearch',
  view_image: 'Image',
};
const label = (n: string | null | undefined) => (n && TOOL_LABELS[n]) || n || 'tool';

// Is this command line an OpenAI Codex CLI session?
export function matchProcess(args: string): boolean {
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

// Newest ~/.codex/state_*.sqlite (the number bumps across schema migrations).
function statePath(): string | null {
  const dir = path.join(os.homedir(), '.codex');
  let best: string | null = null;
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
  } catch {
    /* no ~/.codex */
  }
  return best;
}

// Recent non-archived threads via the system `sqlite3` binary (zero npm deps).
// No -readonly: it fails with SQLITE_CANTOPEN on Codex's WAL-mode DB. capture()
// discards stderr, so a failed open never leaks into the TUI.
function queryThreads(): Rec[] {
  const db = statePath();
  if (!db) return [];
  const sql = 'SELECT id, cwd, model, git_branch, cli_version, updated_at_ms, ' +
    'first_user_message, rollout_path FROM threads WHERE archived = 0 ' +
    'ORDER BY updated_at_ms DESC LIMIT 300;';
  const out = capture('sqlite3', ['-json', db, sql]);
  try {
    return out.trim() ? JSON.parse(out) : [];
  } catch {
    return [];
  }
}

// Codex's configured default model from ~/.codex/config.toml.
function configModel(): string | null {
  try {
    const toml = fs.readFileSync(path.join(os.homedir(), '.codex', 'config.toml'), 'utf8');
    const top = toml.split(/^\s*\[/m)[0];
    const m = top.match(/^\s*model\s*=\s*"([^"]+)"/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function messageText(payload: Rec): string {
  if (!payload) return '';
  if (typeof payload.message === 'string') return payload.message;
  if (Array.isArray(payload.content)) {
    const t = payload.content.find((c: Rec) => c && typeof c.text === 'string');
    if (t) return t.text;
  }
  if (typeof payload.last_agent_message === 'string') return payload.last_agent_message;
  return '';
}

// Derive activity from the last meaningful rollout item.
function deriveActivity(objs: Rec[]): Activity {
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

// Summarize a rollout's tail: model + activity + last-activity time.
export function summarizeTail(
  objs: Rec[],
): Activity & { model: string | null; lastTs: number | null } {
  let model: string | null = null;
  let lastTs: string | null = null;
  for (const o of objs) {
    if (o.timestamp) lastTs = o.timestamp;
    if (o.type === 'turn_context' && o.payload && o.payload.model) model = o.payload.model;
  }
  return { model, lastTs: lastTs ? Date.parse(lastTs) : null, ...deriveActivity(objs) };
}

// Join matched Codex processes to their threads (by working dir).
export function collect(procs: Proc[]): PartialAgent[] {
  const byCwd = new Map<string, Rec[]>();
  for (const t of queryThreads()) {
    const arr = byCwd.get(t.cwd) || [];
    arr.push(t);
    byCwd.set(t.cwd, arr);
  }
  const cfgModel = configModel();

  return procs.map((p) => {
    const pool = p.cwd ? byCwd.get(p.cwd) : undefined;
    const t = pool && pool.length ? pool.shift()! : null;
    let model = cfgModel;
    let version: string | null = null;
    let lastTs: number | null = null;
    let lastPrompt: string | null = null;
    let sessionId: string | null = null;
    let rawState = 'no-session';
    let detail = '';
    let branch: string | null = null;

    if (t) {
      model = t.model || cfgModel;
      version = t.cli_version || null;
      lastTs = t.updated_at_ms || null;
      lastPrompt = t.first_user_message || null;
      sessionId = t.id || null;
      branch = t.git_branch || null;
      rawState = 'unknown';
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
