import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readTailObjects } from '../jsonl.ts';
import { firstLine } from '../state.ts';
import { exeBase } from '../processes.ts';
import type { Activity, PartialAgent, Proc, Rec } from '../types.ts';

export const name = 'claude' as const;
const MAX_SESSION_SCAN = 120;

interface SessionFile {
  file: string;
  mtimeMs: number;
  sessionId: string;
}

interface Summary {
  cwd: string | null;
  model: string | null;
  version: string | null;
  gitBranch: string | null;
  lastTs: number | null;
  lastPrompt: string | null;
  rawState: string;
  detail: string;
  sessionId: string | null;
}

// Is this command line a Claude Code CLI session (not the desktop app / helpers)?
export function matchProcess(args: string): boolean {
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

export function projectsRoot(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

// Every Claude session transcript across all projects, newest first.
export function listSessionFiles(): SessionFile[] {
  const root = projectsRoot();
  let dirs: fs.Dirent[];
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: SessionFile[] = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const dir = path.join(root, d.name);
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const fname of entries) {
      if (!fname.endsWith('.jsonl')) continue;
      const file = path.join(dir, fname);
      try {
        files.push({
          file,
          mtimeMs: fs.statSync(file).mtimeMs,
          sessionId: fname.replace(/\.jsonl$/, ''),
        });
      } catch {
        /* skip */
      }
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files;
}

// Classify what the agent is doing from the last meaningful transcript entry.
function deriveActivity(last: Rec | null): Activity {
  if (!last) return { rawState: 'unknown', detail: '' };
  if (last.type === 'assistant' && last.message) {
    const content = Array.isArray(last.message.content) ? last.message.content : [];
    const tools = content.filter((b: Rec) => b && b.type === 'tool_use').map((b: Rec) => b.name);
    if (tools.length) return { rawState: 'tool', detail: tools.join(', ') };
    const text = content.find((b: Rec) => b && b.type === 'text');
    return { rawState: 'replied', detail: text ? firstLine(text.text) : '' };
  }
  if (last.type === 'user' && last.message) {
    const content = last.message.content;
    if (Array.isArray(content) && content.some((b: Rec) => b && b.type === 'tool_result')) {
      return { rawState: 'thinking', detail: '' };
    }
    return { rawState: 'thinking', detail: firstLine(typeof content === 'string' ? content : '') };
  }
  return { rawState: 'unknown', detail: '' };
}

// Summarize a session from its tail objects.
export function summarize(objs: Rec[]): Summary {
  let cwd: string | null = null;
  let model: string | null = null;
  let version: string | null = null;
  let gitBranch: string | null = null;
  let lastTs: string | null = null;
  let lastPrompt: string | null = null;
  for (const o of objs) {
    if (o.cwd) cwd = o.cwd;
    if (o.version) version = o.version;
    if (o.gitBranch) gitBranch = o.gitBranch;
    if (o.timestamp) lastTs = o.timestamp;
    if (o.type === 'assistant' && o.message && o.message.model) model = o.message.model;
    if (o.type === 'last-prompt' && o.lastPrompt) lastPrompt = o.lastPrompt;
  }
  const act = deriveActivity(objs.length ? objs[objs.length - 1] : null);
  return {
    cwd,
    model,
    version,
    gitBranch,
    lastTs: lastTs ? Date.parse(lastTs) : null,
    lastPrompt,
    rawState: act.rawState,
    detail: act.detail,
    sessionId: null,
  };
}

// Join matched Claude processes to their session transcripts (by working dir).
export function collect(procs: Proc[]): PartialAgent[] {
  const needByCwd = new Map<string, number>();
  for (const p of procs) {
    if (p.cwd) needByCwd.set(p.cwd, (needByCwd.get(p.cwd) || 0) + 1);
  }
  const sessionsByCwd = new Map<string, Summary[]>();
  let scanned = 0;
  for (const f of listSessionFiles()) {
    if (needByCwd.size === 0 || scanned >= MAX_SESSION_SCAN) break;
    scanned++;
    const objs = readTailObjects(f.file);
    if (!objs.length) continue;
    const sum = summarize(objs);
    if (!sum.cwd || !needByCwd.has(sum.cwd)) continue;
    const arr = sessionsByCwd.get(sum.cwd) || [];
    if (arr.length >= (needByCwd.get(sum.cwd) || 0)) continue;
    sum.sessionId = f.sessionId;
    arr.push(sum);
    sessionsByCwd.set(sum.cwd, arr);
  }

  return procs.map((p) => {
    const pool = p.cwd ? sessionsByCwd.get(p.cwd) : undefined;
    const s = pool && pool.length ? pool.shift()! : null;
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
