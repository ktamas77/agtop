import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { readHeadObjects, readTailObjects } from '../jsonl.ts';
import { exeBase } from '../processes.ts';
import { firstLine, gitBranch as gitBranchOf } from '../state.ts';
import {
  listNewest,
  nodeShimHas,
  readJsonFile,
  tokenBase,
  tokenizeArgs,
  xdgDataHome,
} from '../provider-utils.ts';
import { env as readEnv } from '../platform.ts';
import type { Activity, PartialAgent, Proc, Rec } from '../types.ts';

export const name = 'pi' as const;
const MAX_ROOT_SCAN = 60;
const MAX_SESSION_SCAN = 120;
const PI_HINT_RE =
  /@earendil-works[\\/]+pi-coding-agent|pi-coding-agent|packages[\\/]+coding-agent/;
const PI_GO_RE = /pi-go|dimetron[\\/]+pi/i;
const REJECT_SUBCOMMANDS = new Set([
  'auth',
  'completion',
  'config',
  'help',
  'install',
  'list-models',
  'mcp',
  'package',
  'packages',
  'rpc',
  'serve',
  'server',
  'session',
  'sessions',
  'share',
  'uninstall',
  'update',
  'version',
]);

const TOOL_LABELS: Record<string, string> = {
  bash: 'Shell',
  shell: 'Shell',
  terminal: 'Shell',
  read_file: 'Read',
  read: 'Read',
  view: 'Read',
  write_file: 'Write',
  write: 'Write',
  edit: 'Edit',
  replace: 'Edit',
  apply_patch: 'Edit',
  grep: 'Grep',
  search: 'Grep',
  glob: 'Glob',
  fetch: 'Fetch',
  web_fetch: 'Fetch',
};

interface PiSummary extends Activity {
  cwd: string | null;
  sessionId: string | null;
  model: string | null;
  lastPrompt: string | null;
  lastTs: number | null;
}

function defaultEnv(): Record<string, string | undefined> {
  return {
    PI_CODING_AGENT_SESSION_DIR: readEnv('PI_CODING_AGENT_SESSION_DIR'),
    XDG_DATA_HOME: readEnv('XDG_DATA_HOME'),
  };
}

function flagValue(tokens: string[], flag: string): string | null {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === flag) return tokens[i + 1] || null;
    if (token.startsWith(`${flag}=`)) return token.slice(flag.length + 1);
  }
  return null;
}

function hasFlag(tokens: string[], flag: string): boolean {
  return tokens.some((token) => token === flag || token.startsWith(`${flag}=`));
}

function isRejectedCommand(tokens: string[]): boolean {
  if (tokens.some((t) => t === '--help' || t === '-h' || t === '--version' || t === '-v')) {
    return true;
  }
  const command = tokens.slice(1).find((token) => !token.startsWith('-'));
  return command ? REJECT_SUBCOMMANDS.has(command) : false;
}

function hasPiHint(args: string): boolean {
  return PI_HINT_RE.test(args || '');
}

function hasTrustedPiFlag(args: string): boolean {
  const tokens = tokenizeArgs(args);
  return (
    hasFlag(tokens, '--no-session') ||
    hasFlag(tokens, '--session-dir') ||
    hasFlag(tokens, '--session') ||
    hasFlag(tokens, '--fork') ||
    tokens.includes('-c') ||
    tokens.includes('-r')
  );
}

// A bare `pi` executable name collides with unrelated tools — most concretely the
// GNU `pi` arbitrary-precision calculator, invoked as `pi <digits>`. Treat a bare
// `pi` whose only positional arguments are numeric as that tool rather than the
// coding agent. Interactive `pi`, `pi "<prompt>"`, and `pi --session*`/`--fork`
// invocations still match (the flag shapes also via the trusted-flag/hint paths).
function isPiAgentInvocation(tokens: string[]): boolean {
  const positionals = tokens.slice(1).filter((t) => !t.startsWith('-'));
  if (!positionals.length) return true;
  return !positionals.every((t) => /^[0-9]+(?:[.,][0-9]+)?$/.test(t));
}

export function matchProcess(args: string): boolean {
  if (!args || PI_GO_RE.test(args)) return false;
  const tokens = tokenizeArgs(args);
  if (!tokens.length || isRejectedCommand(tokens)) return false;
  const base = exeBase(args);
  if (base === 'pi') return isPiAgentInvocation(tokens);
  if (nodeShimHas(args, ['pi'], 'pi-coding-agent')) return true;
  if (base === 'node') {
    return tokens.slice(1).some((token) => {
      const b = tokenBase(token);
      return (b === 'cli.js' || b === 'index.js' || b === 'pi') && hasPiHint(token);
    });
  }
  return false;
}

function agentHome(): string {
  return path.join(os.homedir(), '.pi', 'agent');
}

function resolveHome(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function resolvePath(value: string | null | undefined, baseDir: string): string | null {
  const expanded = resolveHome(value);
  if (!expanded) return null;
  return path.isAbsolute(expanded) ? expanded : path.resolve(baseDir, expanded);
}

function pushUnique(out: string[], value: string | null | undefined): void {
  if (value && !out.includes(value)) out.push(value);
}

export function sessionRoots(
  cwd: string | null,
  args = '',
  env: Record<string, string | undefined> = defaultEnv(),
): string[] {
  const tokens = tokenizeArgs(args);
  const roots: string[] = [];
  const baseDir = cwd || process.cwd();
  const cliRoot = flagValue(tokens, '--session-dir');
  pushUnique(roots, resolvePath(cliRoot, baseDir));
  pushUnique(roots, resolvePath(env.PI_CODING_AGENT_SESSION_DIR, baseDir));

  const home = agentHome();
  const settings = readJsonFile<Record<string, unknown>>(path.join(home, 'settings.json'), {});
  pushUnique(
    roots,
    resolvePath(typeof settings.sessionDir === 'string' ? settings.sessionDir : null, home),
  );
  pushUnique(roots, path.join(home, 'sessions'));
  pushUnique(roots, path.join(xdgDataHome('pi-coding-agent', env), 'sessions'));
  return roots;
}

function explicitSessionFile(cwd: string | null, args = ''): string | null {
  const value = flagValue(tokenizeArgs(args), '--session');
  if (!value || !value.endsWith('.jsonl')) return null;
  return resolvePath(value, cwd || process.cwd());
}

function listSessionFilesInRoot(root: string): { file: string; mtimeMs: number }[] {
  const files: { file: string; mtimeMs: number }[] = [];
  for (
    const item of listNewest(
      root,
      (file, entry) => entry.isFile() && file.endsWith('.jsonl'),
      40,
    )
  ) {
    files.push(item);
  }
  const dirs = listNewest(root, (_file, entry) => entry.isDirectory(), MAX_ROOT_SCAN);
  for (const dir of dirs) {
    const remaining = MAX_SESSION_SCAN - files.length;
    if (remaining <= 0) break;
    for (
      const item of listNewest(
        dir.file,
        (file, entry) => entry.isFile() && file.endsWith('.jsonl'),
        remaining,
      )
    ) {
      files.push(item);
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files.slice(0, MAX_SESSION_SCAN);
}

function sessionHeader(file: string): Rec | null {
  const header = readHeadObjects(file).find((entry) => entry && entry.type === 'session');
  return header || null;
}

export function findSessionForCwd(
  cwd: string | null,
  args = '',
  env: Record<string, string | undefined> = defaultEnv(),
): string | null {
  const explicit = explicitSessionFile(cwd, args);
  if (explicit) {
    const header = sessionHeader(explicit);
    if (!header || !cwd || header.cwd === cwd) return explicit;
  }
  if (!cwd) return null;
  for (const root of sessionRoots(cwd, args, env)) {
    for (const item of listSessionFilesInRoot(root)) {
      const header = sessionHeader(item.file);
      if (header && header.cwd === cwd) return item.file;
    }
  }
  return null;
}

function parseTs(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && isFinite(value)) {
    return value < 1000000000000 ? value * 1000 : value;
  }
  const parsed = Date.parse(String(value));
  return isNaN(parsed) ? null : parsed;
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return firstLine(content);
  if (!Array.isArray(content)) return '';
  for (const block of content as Rec[]) {
    if (!block) continue;
    if (block.type === 'text' && block.text) return firstLine(block.text);
    if (block.type === 'thinking' && block.thinking) return firstLine(block.thinking);
  }
  return '';
}

function toolNamesFromContent(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return (content as Rec[])
    .filter((block) => block && (block.type === 'toolCall' || block.type === 'tool_use'))
    .map((block) => String(block.name || ''))
    .filter(Boolean);
}

function labelTool(toolName: unknown): string {
  const key = String(toolName || '').toLowerCase();
  return TOOL_LABELS[key] || String(toolName || 'tool');
}

function gsdDetail(entry: Rec): string | null {
  const customType = String(entry.customType || (entry.message && entry.message.customType) || '');
  if (!/gsd/i.test(customType)) return null;
  const data = entry.data || entry.details || (entry.message && entry.message.details) || {};
  const parts: string[] = [];
  if (data.mode) parts.push(String(data.mode));
  if (data.phase) parts.push(`phase ${data.phase}`);
  if (data.status) parts.push(String(data.status));
  if (data.current_phase) parts.push(`phase ${data.current_phase}`);
  if (data.currentPhase) parts.push(`phase ${data.currentPhase}`);
  if (data.step) parts.push(String(data.step));
  const content = entry.content || (entry.message && entry.message.content);
  const fallback = textFromContent(content);
  return `gsd: ${parts.length ? parts.join(' ') : fallback || customType}`;
}

export function activityFromEntry(entry: Rec | null): Activity | null {
  if (!entry) return null;
  if (entry.type === 'custom' || entry.type === 'custom_message') {
    const detail = gsdDetail(entry);
    return detail ? { rawState: 'thinking', detail } : null;
  }
  if (entry.type === 'compaction') {
    return { rawState: 'replied', detail: firstLine(entry.summary) || 'compacted context' };
  }
  if (entry.type === 'branch_summary') {
    return { rawState: 'replied', detail: firstLine(entry.summary) || 'branch summary' };
  }
  if (entry.type !== 'message') return null;
  const message = entry.message || {};
  if (message.role === 'assistant') {
    const tools = toolNamesFromContent(message.content);
    if (tools.length) return { rawState: 'tool', detail: tools.map(labelTool).join(', ') };
    return { rawState: 'replied', detail: textFromContent(message.content) };
  }
  if (message.role === 'user') {
    return { rawState: 'thinking', detail: textFromContent(message.content) };
  }
  if (message.role === 'toolResult') {
    return { rawState: 'thinking', detail: labelTool(message.toolName) };
  }
  if (message.role === 'bashExecution') {
    return { rawState: 'tool', detail: 'Shell' };
  }
  if (message.role === 'custom') {
    const detail = gsdDetail({
      ...entry,
      customType: message.customType,
      details: message.details,
    });
    return { rawState: 'thinking', detail: detail || textFromContent(message.content) };
  }
  return null;
}

export function summarizeFile(file: string): PiSummary {
  const head = readHeadObjects(file);
  const tail = readTailObjects(file, 64 * 1024);
  const header = head.find((entry) => entry && entry.type === 'session') || {};
  const entries = [...head, ...tail];
  let model: string | null = null;
  let lastTs = parseTs(header.timestamp);
  let lastPrompt: string | null = null;
  let lastActivity: Activity = { rawState: 'unknown', detail: '' };
  for (const entry of entries) {
    const ts = parseTs(entry.timestamp || (entry.message && entry.message.timestamp));
    if (ts != null && (lastTs == null || ts >= lastTs)) lastTs = ts;
    if (entry.type === 'model_change' && entry.modelId) model = String(entry.modelId);
    if (entry.type === 'message' && entry.message) {
      const message = entry.message;
      if (message.role === 'assistant' && message.model) model = String(message.model);
      if (message.role === 'user') lastPrompt = textFromContent(message.content);
    }
    const activity = activityFromEntry(entry);
    if (activity) lastActivity = activity;
  }
  return {
    cwd: typeof header.cwd === 'string' ? header.cwd : null,
    sessionId: typeof header.id === 'string' ? header.id : path.basename(file, '.jsonl'),
    model,
    lastPrompt,
    lastTs,
    rawState: lastActivity.rawState,
    detail: lastActivity.detail,
  };
}

function trustedWithoutSession(args: string): boolean {
  return hasPiHint(args) || hasTrustedPiFlag(args);
}

export function collect(procs: Proc[]): PartialAgent[] {
  const poolByCwd = new Map<string, string | null>();
  const sessionFor = (cwd: string | null, args: string) => {
    const key = `${cwd || ''}\0${args || ''}`;
    if (!poolByCwd.has(key)) poolByCwd.set(key, findSessionForCwd(cwd, args));
    return poolByCwd.get(key) || null;
  };

  const out: PartialAgent[] = [];
  for (const p of procs) {
    const file = hasFlag(tokenizeArgs(p.args), '--no-session') ? null : sessionFor(p.cwd, p.args);
    const s = file ? summarizeFile(file) : null;
    if (!s && !trustedWithoutSession(p.args)) continue;
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
