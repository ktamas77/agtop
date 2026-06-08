import os from 'node:os';
import c from './colors.ts';
import { dur, fit, memFromKb, shortModel } from './format.ts';
import type { Agent, DisplayState } from './types.ts';

type ColorName =
  | 'brightGreen'
  | 'brightCyan'
  | 'green'
  | 'yellow'
  | 'gray'
  | 'brightYellow'
  | 'blue';

// State -> { dot, color } for the STATE column.
const STATE_STYLE: Record<DisplayState, { dot: string; color: ColorName; label: string }> = {
  working: { dot: '●', color: 'brightGreen', label: 'working' },
  thinking: { dot: '●', color: 'brightCyan', label: 'thinking' },
  replied: { dot: '○', color: 'green', label: 'replied' },
  active: { dot: '●', color: 'green', label: 'active' },
  waiting: { dot: '○', color: 'yellow', label: 'waiting' },
  idle: { dot: '○', color: 'gray', label: 'idle' },
  stalled: { dot: '◐', color: 'brightYellow', label: 'stalled' },
  live: { dot: '●', color: 'blue', label: 'live' },
};

export type SortKey = 'cpu' | 'mem' | 'up' | 'idle' | 'project' | 'pid';
export const SORTS: SortKey[] = ['cpu', 'mem', 'up', 'idle', 'project', 'pid'];

// Sort the top-level process rows by the active key, keeping each parent's
// subagent rows (parentPid set) pinned directly beneath it regardless of sort.
export function sortAgents(agents: Agent[], sortKey: string, reverse: boolean): Agent[] {
  const cmps: Record<SortKey, (a: Agent, b: Agent) => number> = {
    cpu: (a, b) => b.cpu - a.cpu,
    mem: (a, b) => b.rssKb - a.rssKb,
    up: (a, b) => b.uptimeSec - a.uptimeSec,
    idle: (a, b) => (a.idleSec ?? Infinity) - (b.idleSec ?? Infinity),
    project: (a, b) => a.project.localeCompare(b.project),
    pid: (a, b) => a.pid - b.pid,
  };
  const cmp = cmps[sortKey as SortKey] || (() => 0);

  const subsByParent = new Map<number, Agent[]>();
  for (const a of agents) {
    if (a.parentPid == null) continue;
    const arr = subsByParent.get(a.parentPid) || [];
    arr.push(a);
    subsByParent.set(a.parentPid, arr);
  }

  const top = agents.filter((a) => a.parentPid == null).sort(cmp);
  if (reverse) top.reverse();

  const out: Agent[] = [];
  for (const parent of top) {
    out.push(parent);
    const subs = subsByParent.get(parent.pid);
    if (subs) {
      subs.sort((a, b) => (a.slug || '').localeCompare(b.slug || ''));
      out.push(...subs);
    }
  }
  return out;
}

interface Column {
  key: string;
  header: string;
  width: number;
  align: 'left' | 'right';
}

// Column layout. The `width` here is the minimum/base; PROJECT, BRANCH, and
// ACTIVITY are elastic (see resolveWidths) — width 0 marks ACTIVITY as the
// remainder column.
const COLUMNS: Column[] = [
  { key: 'pid', header: 'PID', width: 7, align: 'right' },
  { key: 'agent', header: 'AGENT', width: 8, align: 'left' },
  { key: 'model', header: 'MODEL', width: 16, align: 'left' },
  { key: 'project', header: 'PROJECT', width: 20, align: 'left' },
  { key: 'branch', header: 'BRANCH', width: 12, align: 'left' },
  { key: 'state', header: 'STATE', width: 10, align: 'left' },
  { key: 'cpu', header: '%CPU', width: 5, align: 'right' },
  { key: 'mem', header: 'MEM', width: 6, align: 'right' },
  { key: 'up', header: 'UP', width: 6, align: 'right' },
  { key: 'idle', header: 'IDLE', width: 6, align: 'right' },
  { key: 'activity', header: 'ACTIVITY', width: 0, align: 'left' },
];

// PROJECT/BRANCH grow toward their widest cell when the terminal has spare room,
// capped so one long value can't eat the row; ACTIVITY takes the remainder but
// never drops below ACTIVITY_MIN. On a narrow terminal this collapses back to the
// old fixed PROJECT 20 / BRANCH 12 layout.
const PROJECT_MIN = 20;
const PROJECT_MAX = 40;
const BRANCH_MIN = 12;
const BRANCH_MAX = 32;
const ACTIVITY_MIN = 10;

// The PROJECT cell shows a subagent's slug in place of the project name.
function projectCellText(a: Agent): string {
  return a.parentPid != null ? a.slug || '(subagent)' : a.project;
}

function branchCellText(a: Agent): string {
  return a.gitBranch && a.gitBranch !== 'HEAD' ? a.gitBranch : a.gitBranch || '-';
}

// Resolve the per-column widths for this frame. Fixed columns keep their static
// width; PROJECT/BRANCH expand to fit their content (bounded by their caps and by
// keeping ACTIVITY >= ACTIVITY_MIN), and ACTIVITY absorbs whatever is left.
function resolveWidths(agents: Agent[], width: number): Record<string, number> {
  const widths: Record<string, number> = {};
  let fixedSum = 0;
  for (const col of COLUMNS) {
    if (col.key === 'project' || col.key === 'branch' || col.key === 'activity') continue;
    widths[col.key] = col.width;
    fixedSum += col.width;
  }
  const gaps = COLUMNS.length - 1; // single space between columns
  const budget = width - fixedSum - gaps; // shared by project + branch + activity

  // Header label is the floor so the column title is never truncated.
  const projContent = Math.max(7, ...agents.map((a) => c.width(projectCellText(a))));
  const branchContent = Math.max(6, ...agents.map((a) => c.width(branchCellText(a))));
  let project = Math.min(Math.max(projContent, PROJECT_MIN), PROJECT_MAX);
  let branch = Math.min(Math.max(branchContent, BRANCH_MIN), BRANCH_MAX);

  // If growing them left ACTIVITY too thin, trim back toward the mins (branch
  // first, then project) until ACTIVITY has its minimum.
  let activity = budget - project - branch;
  if (activity < ACTIVITY_MIN) {
    let deficit = ACTIVITY_MIN - activity;
    const trimBranch = Math.min(deficit, branch - BRANCH_MIN);
    branch -= trimBranch;
    deficit -= trimBranch;
    const trimProject = Math.min(deficit, project - PROJECT_MIN);
    project -= trimProject;
    deficit -= trimProject;
    activity = budget - project - branch;
  }

  widths.project = project;
  widths.branch = branch;
  widths.activity = Math.max(ACTIVITY_MIN, activity);
  return widths;
}

export interface FrameOpts {
  width?: number;
  height?: number;
  interval: number;
  sort: string;
  reverse: boolean;
  once: boolean;
}

export function buildFrame(agents: Agent[], opts: FrameOpts): string {
  const width = opts.width || 100;
  const height = opts.height || 30;
  const lines: string[] = [];

  // ---- Header ----
  // Totals and the "N agents" count cover real processes only; subagents share
  // their parent's PID and resources, so counting them would double-count.
  const procs = agents.filter((a) => a.parentPid == null);
  const subCount = agents.length - procs.length;
  const totalCpu = procs.reduce((s, a) => s + (a.cpu || 0), 0);
  const totalMem = procs.reduce((s, a) => s + (a.rssKb || 0), 0);
  const clock = new Date().toLocaleTimeString();
  const title = c.bold(c.brightCyan('agentop')) + c.dim(' — coding agents');
  const count = (procs.length === 1 ? '1 agent' : `${procs.length} agents`) +
    (subCount ? ` · ${subCount} subagent${subCount === 1 ? '' : 's'}` : '');
  const right = c.dim(`${clock}  ↻${opts.interval}s`);
  lines.push(fit(padBetween(`${title}  ${c.bold(String(count))} running`, right, width), width));
  lines.push(
    fit(
      padBetween(
        c.dim(
          `CPU ${totalCpu.toFixed(1)}%   MEM ${memFromKb(totalMem)}   sort:${opts.sort}${
            opts.reverse ? '↑' : '↓'
          }`,
        ),
        c.dim(`host ${os.hostname().split('.')[0]}`),
        width,
      ),
      width,
    ),
  );
  lines.push('');

  // ---- Resolve column widths (PROJECT/BRANCH grow to fit; ACTIVITY flexes) ----
  const widths = resolveWidths(agents, width);

  // ---- Header row ----
  const headerCells = COLUMNS.map((col) => fit(col.header, widths[col.key], col.align));
  lines.push(c.bold(c.inverse(fit(headerCells.join(' '), width))));

  // ---- Rows ----
  const bodyRows = Math.max(0, height - lines.length - 1); // leave 1 line for footer
  for (const a of agents.slice(0, bodyRows)) {
    lines.push(fit(renderRow(a, widths), width));
  }

  if (agents.length === 0) {
    lines.push('');
    lines.push(fit(c.dim('  No running agents found.'), width));
    lines.push(fit(c.dim('  Start a supported agent in a project, then come back.'), width));
  }

  // ---- Footer ----
  while (lines.length < height - 1) lines.push('');
  const footer = opts.once ? '' : c.inverse(
    fit(
      ' q quit   s sort   r reverse   +/- interval' +
        (agents.length > bodyRows ? `   (+${agents.length - bodyRows} more)` : ''),
      width,
    ),
  );
  if (footer) lines.push(footer);

  return lines.join('\n');
}

function renderRow(a: Agent, widths: Record<string, number>): string {
  const st = STATE_STYLE[a.state] || STATE_STYLE.idle;
  const isSub = a.parentPid != null;
  const cells: Record<string, string> = {
    // Subagents have no OS process of their own: show a SUB tag + ↳parent ref,
    // their slug in place of project, and '-' for the parent-owned resources.
    pid: isSub ? 'SUB' : String(a.pid),
    agent: isSub ? `↳${a.parentPid}` : a.agent || '-',
    model: shortModel(a.model),
    project: projectCellText(a),
    branch: branchCellText(a),
    state: `${st.dot} ${st.label}`,
    cpu: isSub ? '-' : (a.cpu || 0).toFixed(1),
    mem: isSub ? '-' : memFromKb(a.rssKb),
    up: isSub ? '-' : dur(a.uptimeSec),
    idle: a.idleSec == null ? '-' : dur(a.idleSec),
    activity: activityText(a),
  };

  return COLUMNS.map((col) => {
    const text = fit(cells[col.key], widths[col.key], col.align);
    return colorCell(col.key, text, a, st.color);
  }).join(' ');
}

function colorCell(key: string, text: string, a: Agent, stateColor: ColorName): string {
  // Subagent rows read as secondary: dim their SUB tag and ↳parent reference.
  if (a.parentPid != null && (key === 'pid' || key === 'agent')) return c.dim(text);
  switch (key) {
    case 'pid':
      return c.dim(text);
    case 'agent':
      if (a.agent === 'codex') return c.brightGreen(text);
      if (a.agent === 'grok') return c.brightYellow(text);
      if (a.agent === 'gemini') return c.brightBlue(text);
      if (a.agent === 'agy') return c.magenta(text);
      return c.brightCyan(text);
    case 'model':
      return c.brightMagenta(text);
    case 'project':
      return c.bold(text);
    case 'branch':
      return c.cyan(text);
    case 'state':
      return c[stateColor](text);
    case 'cpu':
      return (a.cpu || 0) > 20 ? c.brightYellow(text) : text;
    case 'activity':
      return c.dim(text);
    default:
      return text;
  }
}

function activityText(a: Agent): string {
  if (a.rawState === 'no-session') return a.args || '(no transcript)';
  if (a.rawState === 'tool') return `⚙ ${a.detail}`;
  if (a.rawState === 'thinking') return a.detail ? `▸ ${a.detail}` : '▸ thinking…';
  if (a.rawState === 'replied') return a.detail || 'awaiting input';
  return a.detail || '';
}

// Left + right text on one line, padded to width (ANSI-aware).
function padBetween(left: string, right: string, width: number): string {
  const space = Math.max(1, width - c.width(left) - c.width(right));
  return left + ' '.repeat(space) + right;
}
