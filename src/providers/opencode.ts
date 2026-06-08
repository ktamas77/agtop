import os from 'node:os';
import path from 'node:path';
import { exeBase } from '../processes.ts';
import { queryJson } from '../sqlite.ts';
import { firstLine, gitBranch as gitBranchOf } from '../state.ts';
import { env as readEnv } from '../platform.ts';
import {
  listNewest,
  nodeShimHas,
  safeJsonParse,
  tokenizeArgs,
  xdgDataHome,
} from '../provider-utils.ts';
import type { Activity, PartialAgent, Proc, Rec } from '../types.ts';

export const name = 'opencode' as const;
const REJECT_COMMANDS = new Set([
  'auth',
  'config',
  'db',
  'export',
  'help',
  'import',
  'mcp',
  'models',
  'plugin',
  'serve',
  'server',
  'session',
  'sessions',
  'stats',
  'upgrade',
  'version',
  'web',
]);
const VALUE_FLAGS = new Set([
  '--agent',
  '--hostname',
  '--model',
  '-m',
  '--port',
  '--prompt',
  '--session',
  '-s',
]);

const TOOL_LABELS: Record<string, string> = {
  bash: 'Shell',
  shell: 'Shell',
  terminal: 'Shell',
  read: 'Read',
  read_file: 'Read',
  write: 'Write',
  write_file: 'Write',
  edit: 'Edit',
  patch: 'Edit',
  grep: 'Grep',
  search: 'Grep',
  glob: 'Glob',
  fetch: 'Fetch',
};

interface OpenCodeSummary extends Activity {
  cwd: string | null;
  sessionId: string | null;
  model: string | null;
  lastPrompt: string;
  lastTs: number | null;
}

function defaultEnv(): Record<string, string | undefined> {
  return {
    OPENCODE_DB: readEnv('OPENCODE_DB'),
    OPENCODE_DATA_DIR: readEnv('OPENCODE_DATA_DIR'),
    XDG_DATA_HOME: readEnv('XDG_DATA_HOME'),
  };
}

function positionalArgs(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (VALUE_FLAGS.has(token)) {
      i++;
      continue;
    }
    if ([...VALUE_FLAGS].some((flag) => token.startsWith(`${flag}=`))) continue;
    if (token.startsWith('-')) continue;
    out.push(token);
  }
  return out;
}

function looksLikePath(token: string | undefined): boolean {
  return Boolean(
    token && (token.startsWith('/') || token.startsWith('./') || token.startsWith('../')),
  );
}

export function matchProcess(args: string): boolean {
  if (!args) return false;
  const tokens = tokenizeArgs(args);
  if (!tokens.length) return false;
  const base = exeBase(args);
  if (base !== 'opencode' && !nodeShimHas(args, ['opencode'], 'opencode')) return false;
  if (tokens.some((token) => token === '--help' || token === '-h' || token === '--version')) {
    return false;
  }
  if (base === 'node' && nodeShimHas(args, ['opencode'], 'opencode')) return true;
  const command = positionalArgs(tokens)[0];
  if (!command) return true;
  if (command === 'run' || command === 'tui' || looksLikePath(command)) return true;
  if (REJECT_COMMANDS.has(command)) return false;
  return false;
}

function resolveHome(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function pushUnique(out: string[], value: string | null | undefined): void {
  if (value && !out.includes(value)) out.push(value);
}

export function dbPaths(env: Record<string, string | undefined> = defaultEnv()): string[] {
  const paths: string[] = [];
  pushUnique(paths, resolveHome(env.OPENCODE_DB));
  const dataDir = resolveHome(env.OPENCODE_DATA_DIR) || xdgDataHome('opencode', env);
  pushUnique(paths, path.join(dataDir, 'opencode.db'));
  for (
    const item of listNewest(
      dataDir,
      (file, entry) => entry.isFile() && /^opencode.*\.db$/.test(path.basename(file)),
      6,
    )
  ) {
    pushUnique(paths, item.file);
  }
  return paths;
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

function textFromData(data: unknown): string {
  if (!data) return '';
  if (typeof data === 'string') return firstLine(data);
  const rec = data as Rec;
  if (typeof rec.text === 'string') return firstLine(rec.text);
  if (typeof rec.content === 'string') return firstLine(rec.content);
  if (typeof rec.message === 'string') return firstLine(rec.message);
  if (Array.isArray(rec.content)) {
    const block = rec.content.find((item: Rec) => item && typeof item.text === 'string');
    if (block) return firstLine(block.text);
  }
  return '';
}

function roleFromMessage(data: Rec): unknown {
  return data && (data.role || data.type || data.kind || data.actor);
}

function modelFromRow(row: Rec): string | null {
  const model = safeJsonParse<unknown>(row.model, row.model);
  if (model && typeof model === 'object') {
    const rec = model as Rec;
    if (rec.providerID && rec.id) return `${rec.providerID}/${rec.id}`;
    return typeof rec.id === 'string' ? rec.id : typeof rec.model === 'string' ? rec.model : null;
  }
  return typeof model === 'string' ? model : null;
}

export function activityFromData(messageData: Rec, partData: Rec): Activity {
  const partType = partData && (partData.type || partData.kind);
  if (partType) {
    if (/tool|bash|shell/i.test(String(partType))) {
      return { rawState: 'tool', detail: labelTool(partData.tool || partData.name || partType) };
    }
    if (/reason/i.test(String(partType))) {
      return { rawState: 'thinking', detail: textFromData(partData) };
    }
    if (/text/i.test(String(partType)) && textFromData(partData)) {
      const role = roleFromMessage(messageData);
      return {
        rawState: role === 'user' ? 'thinking' : 'replied',
        detail: textFromData(partData),
      };
    }
  }
  const role = roleFromMessage(messageData);
  if (role === 'user') return { rawState: 'thinking', detail: textFromData(messageData) };
  if (role === 'assistant') return { rawState: 'replied', detail: textFromData(messageData) };
  if (typeof role === 'string' && /tool/i.test(role)) {
    return { rawState: 'tool', detail: labelTool(messageData.tool || messageData.name || role) };
  }
  return { rawState: 'unknown', detail: textFromData(messageData) };
}

export function summarizeRow(row: Rec): OpenCodeSummary {
  const firstMessage = safeJsonParse<Rec>(row.first_message_data, {});
  const lastMessage = safeJsonParse<Rec>(row.last_message_data, {});
  const lastPart = safeJsonParse<Rec>(row.last_part_data, {});
  const lastTs = parseTs(row.last_part_time) ||
    parseTs(row.last_message_time) ||
    parseTs(row.time_updated) ||
    parseTs(row.time_created);
  return {
    cwd: typeof row.worktree === 'string'
      ? row.worktree
      : typeof row.directory === 'string'
      ? row.directory
      : null,
    sessionId: typeof row.id === 'string' ? row.id : null,
    model: modelFromRow(row),
    lastPrompt: textFromData(firstMessage),
    lastTs,
    ...activityFromData(lastMessage, lastPart),
  };
}

export function queryRows(db: string): Rec[] {
  const sql = `
    SELECT
      s.id,
      s.directory,
      s.title,
      s.model,
      s.agent,
      s.time_created,
      s.time_updated,
      p.worktree,
      (SELECT m.data FROM message m WHERE m.session_id = s.id ORDER BY m.time_created, m.id LIMIT 1) AS first_message_data,
      (SELECT m.data FROM message m WHERE m.session_id = s.id ORDER BY m.time_created DESC, m.id DESC LIMIT 1) AS last_message_data,
      (SELECT m.time_created FROM message m WHERE m.session_id = s.id ORDER BY m.time_created DESC, m.id DESC LIMIT 1) AS last_message_time,
      (SELECT pt.data FROM part pt WHERE pt.session_id = s.id ORDER BY pt.time_created DESC, pt.id DESC LIMIT 1) AS last_part_data,
      (SELECT pt.time_created FROM part pt WHERE pt.session_id = s.id ORDER BY pt.time_created DESC, pt.id DESC LIMIT 1) AS last_part_time
    FROM session s
    LEFT JOIN project p ON p.id = s.project_id
    ORDER BY COALESCE(s.time_updated, s.time_created) DESC
    LIMIT 500;
  `;
  return queryJson(db, sql);
}

export function querySessions(env: Record<string, string | undefined> = defaultEnv()): Rec[] {
  for (const db of dbPaths(env)) {
    const rows = queryRows(db);
    if (rows.length) return rows;
  }
  return [];
}

export function collect(procs: Proc[]): PartialAgent[] {
  const rows = querySessions().map(summarizeRow);
  const out: PartialAgent[] = [];
  for (const p of procs) {
    const index = rows.findIndex((row) => row.cwd === p.cwd);
    const s = index >= 0 ? rows.splice(index, 1)[0] : null;
    const cwd = (s && s.cwd) || p.cwd;
    out.push({
      agent: name,
      pid: p.pid,
      cpu: p.cpu,
      rssKb: p.rssKb,
      uptimeSec: p.uptimeSec,
      cwd,
      project: cwd ? path.basename(cwd) : '(unknown)',
      args: p.args,
      model: s ? s.model : null,
      version: null,
      gitBranch: gitBranchOf(cwd),
      sessionId: s ? s.sessionId : null,
      lastPrompt: s ? s.lastPrompt : null,
      lastTs: s ? s.lastTs : null,
      rawState: s ? s.rawState : 'no-session',
      detail: s ? s.detail : '',
    });
  }
  return out;
}
