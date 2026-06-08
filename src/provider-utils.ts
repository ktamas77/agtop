import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { env as readEnv } from './platform.ts';

// deno-lint-ignore no-control-regex
const ANSI_RE = /\x1b(?:\[[0-?]*[ -/]*[@-~]|[ -/]*[@-~])/g;
// deno-lint-ignore no-control-regex
const OSC_RE = /\x1b\][^\x07]*(?:\x07|\x1b\\)/g;
// deno-lint-ignore no-control-regex
const CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const RECORD_STRING_FIELDS = [
  'agent',
  'cwd',
  'project',
  'args',
  'model',
  'version',
  'gitBranch',
  'sessionId',
  'lastPrompt',
  'rawState',
  'detail',
  'slug',
];

export interface NewestFile {
  file: string;
  mtimeMs: number;
}

export function tokenizeArgs(args: unknown): string[] {
  return String(args || '').trim().split(/\s+/).filter(Boolean);
}

export function tokenBase(token: unknown): string {
  return path.basename(String(token || ''));
}

export function commandBase(args: string): string {
  return tokenBase(tokenizeArgs(args)[0]);
}

export function hasExecutable(args: string, names: string | string[]): boolean {
  const set = new Set(Array.isArray(names) ? names : [names]);
  return set.has(commandBase(args));
}

export function nodeShimHas(args: string, names: string | string[], hint?: string): boolean {
  const tokens = tokenizeArgs(args);
  const base = tokenBase(tokens[0]);
  if (base !== 'node') return false;
  const set = new Set(Array.isArray(names) ? names : [names]);
  return tokens.slice(1).some((token) => {
    const b = tokenBase(token);
    return set.has(b) || Boolean(hint && b === 'cli.js' && token.includes(hint));
  });
}

export function sanitizeText(value: unknown, maxLength?: number): string | null | undefined {
  if (value == null) return value as null | undefined;
  let text = String(value)
    .replace(OSC_RE, '')
    .replace(ANSI_RE, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(CONTROL_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (maxLength && text.length > maxLength) text = text.slice(0, maxLength);
  return text;
}

export function sanitizeAgentRecord<T extends Record<string, unknown>>(record: T): T {
  const out: Record<string, unknown> = { ...record };
  for (const field of RECORD_STRING_FIELDS) {
    if (field in out) out[field] = sanitizeText(out[field]);
  }
  return out as T;
}

export function safeJsonParse<T>(text: unknown, fallback: T): T {
  try {
    return JSON.parse(String(text)) as T;
  } catch {
    return fallback;
  }
}

export function readJsonFile<T>(file: string, fallback: T): T {
  try {
    return safeJsonParse(fs.readFileSync(file, 'utf8'), fallback);
  } catch {
    return fallback;
  }
}

export function listNewest(
  dir: string,
  predicate: ((file: string, entry: fs.Dirent) => boolean) | null = null,
  limit = Infinity,
): NewestFile[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: NewestFile[] = [];
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (predicate && !predicate(file, entry)) continue;
    try {
      files.push({ file, mtimeMs: fs.statSync(file).mtimeMs });
    } catch {
      /* skip unreadable entries */
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files.slice(0, limit);
}

export function xdgDataHome(
  appName?: string,
  env: Record<string, string | undefined> = {},
): string {
  const base = env.XDG_DATA_HOME || readEnv('XDG_DATA_HOME') ||
    path.join(os.homedir(), '.local', 'share');
  return appName ? path.join(base, appName) : base;
}
