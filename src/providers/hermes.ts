import os from 'node:os';
import path from 'node:path';
import { queryJson } from '../sqlite.ts';
import { firstLine, gitBranch as gitBranchOf } from '../state.ts';
import { env as readEnv } from '../platform.ts';
import { nodeShimHas, safeJsonParse, tokenBase, tokenizeArgs } from '../provider-utils.ts';
import type { Activity, PartialAgent, Proc, Rec } from '../types.ts';

export const name = 'hermes' as const;
const PYTHON_RE = /^python(?:\d+(?:\.\d+)?)?$/;
const REJECT_SUBCOMMANDS = new Set([
  'config',
  'gateway',
  'help',
  'models',
  'profile',
  'profiles',
  'session',
  'sessions',
  'serve',
  'server',
  'tools',
  'version',
]);

const TOOL_LABELS: Record<string, string> = {
  bash: 'Shell',
  terminal: 'Shell',
  shell: 'Shell',
  read_file: 'Read',
  read: 'Read',
  write_file: 'Write',
  write: 'Write',
  edit: 'Edit',
  apply_patch: 'Edit',
  grep: 'Grep',
  search: 'Grep',
  web_search: 'WebSearch',
};

interface HermesSummary extends Activity {
  sessionId: string | null;
  model: string | null;
  lastPrompt: string | null;
  lastTs: number | null;
}

function isHermesEntrypoint(token: string): boolean {
  const base = tokenBase(token);
  return base === 'hermes' || (base === 'cli.js' && token.includes('hermes'));
}

function hermesEntrypointIndex(tokens: string[]): number {
  const base = tokenBase(tokens[0]);
  if (base === 'hermes') return 0;
  if (base !== 'node' && !PYTHON_RE.test(base)) return -1;
  return tokens.findIndex((token, index) => index > 0 && isHermesEntrypoint(token));
}

function commandAfterHermes(tokens: string[], entrypointIndex: number): string | null {
  for (const token of tokens.slice(entrypointIndex + 1)) {
    if (!token.startsWith('-')) return token;
  }
  return null;
}

export function matchProcess(args: string): boolean {
  if (!args) return false;
  const tokens = tokenizeArgs(args);
  if (!tokens.length) return false;
  const entrypointIndex = hermesEntrypointIndex(tokens);
  if (entrypointIndex < 0 && !nodeShimHas(args, ['hermes'], 'hermes')) return false;
  if (tokens.some((token) => token === '--help' || token === '-h' || token === '--version')) {
    return false;
  }
  const command = commandAfterHermes(tokens, Math.max(entrypointIndex, 0));
  if (!command) return true;
  if (command === 'chat') return true;
  if (REJECT_SUBCOMMANDS.has(command)) return false;
  return false;
}

function resolveHome(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

export function hermesHome(env: Record<string, string | undefined> = {}): string {
  return resolveHome(env.HERMES_HOME || readEnv('HERMES_HOME')) ||
    path.join(os.homedir(), '.hermes');
}

export function dbPath(env: Record<string, string | undefined> = {}): string {
  return path.join(hermesHome(env), 'state.db');
}

function parseTs(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && isFinite(value)) {
    return value < 1000000000000 ? value * 1000 : value;
  }
  const parsed = Date.parse(String(value));
  return isNaN(parsed) ? null : parsed;
}

function labelTool(toolName: unknown): string {
  const key = String(toolName || '').toLowerCase();
  return TOOL_LABELS[key] || String(toolName || 'tool');
}

function toolFromCalls(value: unknown): string | null {
  const calls = typeof value === 'string' ? safeJsonParse<unknown>(value, null) : value;
  if (!Array.isArray(calls) || !calls.length) return null;
  const last = calls[calls.length - 1] as Rec;
  return (
    last.name || (last.function && last.function.name) || last.tool_name || last.toolName || null
  );
}

export function activityFromRow(row: Rec): Activity {
  const tool = row.last_tool_name || toolFromCalls(row.last_tool_calls);
  if (tool) return { rawState: 'tool', detail: labelTool(tool) };
  if (row.last_role === 'user') {
    return { rawState: 'thinking', detail: firstLine(row.last_content) };
  }
  if (row.last_role === 'assistant') {
    if (!row.last_content && row.last_reasoning) {
      return { rawState: 'thinking', detail: firstLine(row.last_reasoning) };
    }
    return { rawState: 'replied', detail: firstLine(row.last_content) || firstLine(row.title) };
  }
  if (typeof row.last_role === 'string' && row.last_role.includes('tool')) {
    return { rawState: 'thinking', detail: labelTool(tool || row.last_role) };
  }
  return { rawState: 'unknown', detail: firstLine(row.title) };
}

export function summarizeRow(row: Rec): HermesSummary {
  const lastTs = parseTs(row.last_ts || row.started_at);
  return {
    sessionId: typeof row.id === 'string' ? row.id : null,
    model: typeof row.model === 'string' ? row.model : null,
    lastPrompt: firstLine(row.first_user_message),
    lastTs,
    ...activityFromRow(row),
  };
}

export function querySessions(db = dbPath()): Rec[] {
  const sql = `
    SELECT
      s.id,
      s.model,
      s.title,
      s.started_at,
      s.ended_at,
      COALESCE((SELECT MAX(m.timestamp) FROM messages m WHERE m.session_id = s.id), s.started_at) AS last_ts,
      (SELECT m.content FROM messages m WHERE m.session_id = s.id AND m.role = 'user' AND m.content IS NOT NULL ORDER BY m.timestamp, m.id LIMIT 1) AS first_user_message,
      (SELECT m.role FROM messages m WHERE m.session_id = s.id ORDER BY m.timestamp DESC, m.id DESC LIMIT 1) AS last_role,
      (SELECT m.content FROM messages m WHERE m.session_id = s.id ORDER BY m.timestamp DESC, m.id DESC LIMIT 1) AS last_content,
      (SELECT m.tool_name FROM messages m WHERE m.session_id = s.id ORDER BY m.timestamp DESC, m.id DESC LIMIT 1) AS last_tool_name,
      (SELECT m.tool_calls FROM messages m WHERE m.session_id = s.id ORDER BY m.timestamp DESC, m.id DESC LIMIT 1) AS last_tool_calls,
      (SELECT m.reasoning FROM messages m WHERE m.session_id = s.id ORDER BY m.timestamp DESC, m.id DESC LIMIT 1) AS last_reasoning
    FROM sessions s
    ORDER BY last_ts DESC
    LIMIT 300;
  `;
  return queryJson(db, sql);
}

export function collect(procs: Proc[]): PartialAgent[] {
  const sessions = querySessions().map(summarizeRow);
  const out: PartialAgent[] = [];
  for (const p of procs) {
    const s = sessions.shift();
    out.push({
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
    });
  }
  return out;
}
