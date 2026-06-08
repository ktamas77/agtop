'use strict';

const fs = require('fs');
const path = require('path');

// Combine a provider's raw activity (tool / thinking / replied / no-session)
// with how long ago it happened into a display state shared across providers.
function classifyState(rawState, idleSec) {
  if (rawState === 'no-session') return 'live';
  if (idleSec == null) return 'idle';
  if (rawState === 'tool') return idleSec < 120 ? 'working' : 'stalled';
  if (rawState === 'thinking') return idleSec < 120 ? 'thinking' : 'stalled';
  if (rawState === 'replied') return idleSec < 30 ? 'replied' : 'waiting';
  return idleSec < 30 ? 'active' : 'idle';
}

// First non-empty line of a string, trimmed and capped — for activity summaries.
function firstLine(s) {
  if (!s) return '';
  const line =
    String(s)
      .split('\n')
      .find((l) => l.trim()) || '';
  return line.trim().slice(0, 120);
}

// Best-effort current git branch for a working directory, read straight from
// .git/HEAD (no subprocess). Returns null if not a repo / detached / unreadable.
function gitBranch(cwd) {
  if (!cwd) return null;
  try {
    const head = fs.readFileSync(path.join(cwd, '.git', 'HEAD'), 'utf8').trim();
    const m = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    return m ? m[1] : null;
  } catch (e) {
    return null;
  }
}

module.exports = { classifyState, firstLine, gitBranch };
