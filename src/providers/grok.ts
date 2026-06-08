import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readTailObjects } from '../jsonl.ts';
import { gitBranch as gitBranchOf } from '../state.ts';
import { exeBase } from '../processes.ts';
import type { Activity, PartialAgent, Proc, Rec } from '../types.ts';

export const name = 'grok' as const;

// Friendly labels for Grok's tool names (mirrors how Claude tools read).
const TOOL_LABELS: Record<string, string> = {
  run_terminal_command: 'Shell',
  edit_file: 'Edit',
  str_replace_editor: 'Edit',
  create_file: 'Write',
  read_file: 'Read',
  view_file: 'Read',
  web_search: 'WebSearch',
};
const label = (n: string | null | undefined) => (n && TOOL_LABELS[n]) || n || 'tool';

interface SessionDir {
  dir: string;
  mtimeMs: number;
}
interface SessionSummary extends Activity {
  model: string | null;
  lastTs: number | null;
  sessionId: string | null;
  lastPrompt: string | null;
}

// Is this command line an xAI Grok CLI session?
export function matchProcess(args: string): boolean {
  if (!args) return false;
  const tokens = args.trim().split(/\s+/);
  const base = exeBase(args);
  if (base === 'grok') return true;
  if (base === 'node' || /\/node$/.test(tokens[0] || '')) {
    return tokens.slice(1).some((t) => {
      const b = t.split('/').pop();
      return b === 'grok' || (b === 'cli.js' && /grok/.test(t));
    });
  }
  return false;
}

function sessionsRoot(): string {
  return path.join(os.homedir(), '.grok', 'sessions');
}

// ~/.grok/sessions/<encodeURIComponent(cwd)>/<session-id>/ — newest sub-dir first.
function listSessions(cwd: string): SessionDir[] {
  const dir = path.join(sessionsRoot(), encodeURIComponent(cwd));
  let subs: fs.Dirent[];
  try {
    subs = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: SessionDir[] = [];
  for (const d of subs) {
    if (!d.isDirectory()) continue;
    const full = path.join(dir, d.name);
    let m = 0;
    try {
      m = fs.statSync(full).mtimeMs;
    } catch {
      /* skip */
    }
    out.push({ dir: full, mtimeMs: m });
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

// Derive activity from a session's events.jsonl tail (turn / phase / tool events).
export function summarizeEvents(events: Rec[]): Activity {
  const last = events[events.length - 1];
  if (!last) return { rawState: 'unknown', detail: '' };
  if (last.type === 'turn_ended') return { rawState: 'replied', detail: '' };

  let phase: string | null = null;
  let tool: string | null = null;
  for (const e of events) {
    if (e.type === 'phase_changed' && e.phase) phase = e.phase;
    if (e.type === 'tool_started') tool = e.tool_name;
    if (e.type === 'tool_completed') tool = null;
  }
  if (tool || phase === 'tool_execution') return { rawState: 'tool', detail: label(tool) };
  if (phase === 'permission_prompt') return { rawState: 'tool', detail: 'awaiting approval' };
  return { rawState: 'thinking', detail: '' };
}

// Read a session sub-directory's summary.json + events.jsonl tail.
export function summarizeSession(sessionDir: string): SessionSummary {
  let model: string | null = null;
  let lastTs: number | null = null;
  let sessionId: string | null = null;
  let lastPrompt: string | null = null;
  try {
    const s = JSON.parse(fs.readFileSync(path.join(sessionDir, 'summary.json'), 'utf8'));
    model = s.current_model_id || null;
    lastTs = s.updated_at ? Date.parse(s.updated_at) : null;
    sessionId = (s.info && s.info.id) || null;
    lastPrompt = s.session_summary || null;
  } catch {
    /* no/invalid summary */
  }
  const events = readTailObjects(path.join(sessionDir, 'events.jsonl'), 16 * 1024);
  if (lastTs == null) {
    const lastEv = [...events].reverse().find((e) => e && e.ts);
    if (lastEv) lastTs = Date.parse(lastEv.ts);
  }
  return { model, lastTs, sessionId, lastPrompt, ...summarizeEvents(events) };
}

// Join matched Grok processes to their session directories (by working dir).
export function collect(procs: Proc[]): PartialAgent[] {
  const poolByCwd = new Map<string, SessionDir[]>();
  const pool = (cwd: string) => {
    if (!poolByCwd.has(cwd)) poolByCwd.set(cwd, listSessions(cwd));
    return poolByCwd.get(cwd)!;
  };

  return procs.map((p) => {
    let s: SessionSummary | null = null;
    if (p.cwd) {
      const sessions = pool(p.cwd);
      if (sessions.length) s = summarizeSession(sessions.shift()!.dir);
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
      lastPrompt: s ? s.lastPrompt : null,
      lastTs: s ? s.lastTs : null,
      rawState: s ? s.rawState : 'no-session',
      detail: s ? s.detail : '',
    };
  });
}
