import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readHeadObjects, readTailObjects } from '../jsonl.ts';
import { firstLine, gitBranch as gitBranchOf } from '../state.ts';
import { exeBase } from '../processes.ts';
import type { Activity, PartialAgent, Proc, Rec } from '../types.ts';

// Google's Antigravity CLI — the command is `agy`; sessions live under
// ~/.gemini/antigravity-cli/. We label the agent by its command, `agy`.
export const name = 'agy' as const;
const MAX_BRAIN_SCAN = 80;

const STEP_LABELS: Record<string, string> = {
  LIST_DIRECTORY: 'List',
  VIEW_FILE: 'Read',
  READ_FILE: 'Read',
  CODE_ACTION: 'Edit',
  EDIT_FILE: 'Edit',
  RUN_COMMAND: 'Shell',
  WEB_SEARCH: 'WebSearch',
};
const TOOL_STEP = new Set(Object.keys(STEP_LABELS));

interface Conversation {
  convId: string;
  mtimeMs: number;
}
interface ConvSummary extends Activity {
  model: string | null;
  lastTs: number | null;
}

export function matchProcess(args: string): boolean {
  if (!args) return false;
  const tokens = args.trim().split(/\s+/);
  const base = exeBase(args);
  if (base === 'agy') return true;
  if (base === 'node' || /\/node$/.test(tokens[0] || '')) {
    return tokens.slice(1).some((t) => t.split('/').pop() === 'agy');
  }
  return false;
}

function brainRoot(): string {
  return path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain');
}

function transcriptPath(convId: string): string {
  return path.join(brainRoot(), convId, '.system_generated', 'logs', 'transcript.jsonl');
}

// Conversation ids (brain sub-dirs), newest transcript first.
function listConversations(): Conversation[] {
  let dirs: fs.Dirent[];
  try {
    dirs = fs.readdirSync(brainRoot(), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Conversation[] = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    try {
      out.push({ convId: d.name, mtimeMs: fs.statSync(transcriptPath(d.name)).mtimeMs });
    } catch {
      /* no transcript yet */
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

// Derive activity from the last transcript step.
export function summarizeSteps(objs: Rec[]): Activity {
  const steps = objs.filter((o) => o && o.type);
  const last = steps[steps.length - 1];
  if (!last) return { rawState: 'unknown', detail: '' };
  if (last.type === 'USER_INPUT') return { rawState: 'thinking', detail: '' };
  if (last.type === 'PLANNER_RESPONSE') {
    return last.status === 'DONE'
      ? { rawState: 'replied', detail: firstLine(last.content) }
      : { rawState: 'thinking', detail: '' };
  }
  if (TOOL_STEP.has(last.type)) return { rawState: 'tool', detail: STEP_LABELS[last.type] };
  return { rawState: 'thinking', detail: '' };
}

// Pull the human-readable model from the `USER_SETTINGS_CHANGE` line, e.g.
// "…Model Selection from None to Gemini 3.5 Flash (Medium)." -> "gemini-3.5-flash".
export function modelFrom(objs: Rec[]): string | null {
  for (const o of objs) {
    const text = typeof o.content === 'string' ? o.content : '';
    // Capture up to the parenthetical tier, the sentence end, or a newline —
    // but NOT the dot inside a version like "3.5".
    const m = text.match(/Model Selection`?\s+from\s+\S+\s+to\s+(.+?)\s*(?:\(|\.\s|\.$|\n|$)/i);
    if (m) return m[1].trim().toLowerCase().replace(/\s+/g, '-');
  }
  return null;
}

// Summarize a conversation; null when the transcript does not belong to `cwd`.
export function summarizeConversation(convId: string, cwd: string | null): ConvSummary | null {
  const tp = transcriptPath(convId);
  const head = readHeadObjects(tp, 16 * 1024);
  const tail = readTailObjects(tp, 24 * 1024);
  // The transcript references the workspace via file:// / DirectoryPath entries.
  const belongs = cwd && (JSON.stringify(head).includes(cwd) || JSON.stringify(tail).includes(cwd));
  if (!belongs) return null;
  let lastTs: number | null = null;
  for (const o of tail) {
    if (o && o.created_at) {
      const ms = Date.parse(o.created_at);
      if (!isNaN(ms) && (lastTs == null || ms > lastTs)) lastTs = ms;
    }
  }
  return { model: modelFrom(head), lastTs, ...summarizeSteps(tail) };
}

export function collect(procs: Proc[]): PartialAgent[] {
  const conversations = listConversations();
  const claimed = new Set<string>();

  return procs.map((p) => {
    let s: ConvSummary | null = null;
    let convId: string | null = null;
    if (p.cwd) {
      let scanned = 0;
      for (const c of conversations) {
        if (scanned >= MAX_BRAIN_SCAN) break;
        if (claimed.has(c.convId)) continue;
        scanned++;
        const sum = summarizeConversation(c.convId, p.cwd);
        if (sum) {
          s = sum;
          convId = c.convId;
          claimed.add(c.convId);
          break;
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
      model: s ? s.model : null,
      version: null,
      gitBranch: gitBranchOf(p.cwd),
      sessionId: convId,
      lastPrompt: null,
      lastTs: s ? s.lastTs : null,
      rawState: s ? s.rawState : 'no-session',
      detail: s ? s.detail : '',
    };
  });
}
