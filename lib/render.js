'use strict';

const os = require('os');
const c = require('./colors');
const { shortModel, dur, memFromKb, fit } = require('./format');

// State -> { dot, color } for the STATE column.
const STATE_STYLE = {
  working: { dot: '●', color: 'brightGreen', label: 'working' },
  thinking: { dot: '●', color: 'brightCyan', label: 'thinking' },
  replied: { dot: '○', color: 'green', label: 'replied' },
  active: { dot: '●', color: 'green', label: 'active' },
  waiting: { dot: '○', color: 'yellow', label: 'waiting' },
  idle: { dot: '○', color: 'gray', label: 'idle' },
  stalled: { dot: '◐', color: 'brightYellow', label: 'stalled' },
  live: { dot: '●', color: 'blue', label: 'live' },
};

const SORTS = ['cpu', 'mem', 'up', 'idle', 'project', 'pid'];

function sortAgents(agents, sortKey, reverse) {
  const cmp = {
    cpu: (a, b) => b.cpu - a.cpu,
    mem: (a, b) => b.rssKb - a.rssKb,
    up: (a, b) => b.uptimeSec - a.uptimeSec,
    idle: (a, b) => (a.idleSec ?? Infinity) - (b.idleSec ?? Infinity),
    project: (a, b) => a.project.localeCompare(b.project),
    pid: (a, b) => a.pid - b.pid,
  }[sortKey] || (() => 0);
  const sorted = agents.slice().sort(cmp);
  if (reverse) sorted.reverse();
  return sorted;
}

// Column layout: [key, header, width, align]
const COLUMNS = [
  ['pid', 'PID', 7, 'right'],
  ['model', 'MODEL', 12, 'left'],
  ['project', 'PROJECT', 20, 'left'],
  ['branch', 'BRANCH', 12, 'left'],
  ['state', 'STATE', 10, 'left'],
  ['cpu', '%CPU', 5, 'right'],
  ['mem', 'MEM', 6, 'right'],
  ['up', 'UP', 6, 'right'],
  ['idle', 'IDLE', 6, 'right'],
  ['activity', 'ACTIVITY', 0, 'left'], // 0 == flex, takes remaining width
];

function buildFrame(agents, opts) {
  const width = opts.width || (process.stdout.columns || 100);
  const height = opts.height || (process.stdout.rows || 30);
  const lines = [];

  // ---- Header ----
  const totalCpu = agents.reduce((s, a) => s + (a.cpu || 0), 0);
  const totalMem = agents.reduce((s, a) => s + (a.rssKb || 0), 0);
  const clock = new Date().toLocaleTimeString();
  const title = c.bold(c.brightCyan('atop')) + c.dim(' — Claude agents');
  const count = agents.length === 1 ? '1 agent' : `${agents.length} agents`;
  const right = c.dim(`${clock}  ↻${opts.interval}s`);
  lines.push(padBetween(`${title}  ${c.bold(String(count))} running`, right, width));
  lines.push(
    padBetween(
      c.dim(`CPU ${totalCpu.toFixed(1)}%   MEM ${memFromKb(totalMem)}   sort:${opts.sort}${opts.reverse ? '↑' : '↓'}`),
      c.dim(`host ${os.hostname().split('.')[0]}`),
      width
    )
  );
  lines.push('');

  // ---- Resolve flex width for ACTIVITY ----
  const fixed = COLUMNS.filter((col) => col[2] > 0).reduce((s, col) => s + col[2], 0);
  const gaps = COLUMNS.length - 1; // single space between columns
  const flex = Math.max(10, width - fixed - gaps);

  // ---- Header row ----
  const headerCells = COLUMNS.map((col) => {
    const w = col[2] === 0 ? flex : col[2];
    return fit(col[1], w, col[3]);
  });
  lines.push(c.bold(c.inverse(fit(headerCells.join(' '), width))));

  // ---- Rows ----
  const bodyRows = Math.max(0, height - lines.length - 1); // leave 1 line for footer
  const shown = agents.slice(0, bodyRows);
  for (const a of shown) {
    lines.push(renderRow(a, flex));
  }

  if (agents.length === 0) {
    lines.push('');
    lines.push(c.dim('  No running Claude agents found.'));
    lines.push(c.dim('  Start one with `claude` in any project, then come back.'));
  }

  // ---- Footer ----
  while (lines.length < height - 1) lines.push('');
  const footer = opts.once
    ? ''
    : c.inverse(
        fit(
          ' q quit   s sort   r reverse   +/- interval' +
            (agents.length > bodyRows ? `   (+${agents.length - bodyRows} more)` : ''),
          width
        )
      );
  if (footer) lines.push(footer);

  return lines.join('\n');
}

function renderRow(a, flex) {
  const st = STATE_STYLE[a.state] || STATE_STYLE.idle;
  const cells = {
    pid: String(a.pid),
    model: shortModel(a.model),
    project: a.project,
    branch: a.gitBranch && a.gitBranch !== 'HEAD' ? a.gitBranch : (a.gitBranch || '-'),
    state: `${st.dot} ${st.label}`,
    cpu: (a.cpu || 0).toFixed(1),
    mem: memFromKb(a.rssKb),
    up: dur(a.uptimeSec),
    idle: a.idleSec == null ? '-' : dur(a.idleSec),
    activity: activityText(a),
  };

  const out = COLUMNS.map((col) => {
    const [key, , w, align] = col;
    const width = w === 0 ? flex : w;
    const text = fit(cells[key], width, align);
    return colorCell(key, text, a, st);
  });
  return out.join(' ');
}

function colorCell(key, text, a, st) {
  switch (key) {
    case 'pid':
      return c.dim(text);
    case 'model':
      return c.brightMagenta(text);
    case 'project':
      return c.bold(text);
    case 'branch':
      return c.cyan(text);
    case 'state':
      return c[st.color] ? c[st.color](text) : text;
    case 'cpu':
      return (a.cpu || 0) > 20 ? c.brightYellow(text) : text;
    case 'activity':
      return c.dim(text);
    default:
      return text;
  }
}

function activityText(a) {
  if (a.rawState === 'no-session') return a.args || '(no transcript)';
  if (a.rawState === 'tool') return `⚙ ${a.detail}`;
  if (a.rawState === 'thinking') return a.detail ? `▸ ${a.detail}` : '▸ thinking…';
  if (a.rawState === 'replied') return a.detail || 'awaiting input';
  return a.detail || '';
}

// Left + right text on one line, padded to width (ANSI-aware).
function padBetween(left, right, width) {
  const lw = c.width(left);
  const rw = c.width(right);
  const space = Math.max(1, width - lw - rw);
  return left + ' '.repeat(space) + right;
}

module.exports = { buildFrame, sortAgents, SORTS };
