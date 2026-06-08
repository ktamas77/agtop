'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function projectsRoot() {
  return path.join(os.homedir(), '.claude', 'projects');
}

// List every session transcript across all projects, newest first.
function listSessionFiles() {
  const root = projectsRoot();
  let dirs;
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true });
  } catch (e) {
    return [];
  }
  const files = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const dir = path.join(root, d.name);
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch (e) {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.jsonl')) continue;
      const file = path.join(dir, name);
      try {
        const st = fs.statSync(file);
        files.push({ file, dir, mtimeMs: st.mtimeMs, sessionId: name.replace(/\.jsonl$/, '') });
      } catch (e) {
        /* skip */
      }
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files;
}

// Read the last `bytes` of a file and return parsed JSONL objects (dropping a
// partial first line). Cheap way to inspect a long transcript's recent activity.
function readTailObjects(file, bytes = 24 * 1024) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const { size } = fs.fstatSync(fd);
    const start = Math.max(0, size - bytes);
    const len = size - start;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    let text = buf.toString('utf8');
    if (start > 0) {
      const nl = text.indexOf('\n');
      if (nl !== -1) text = text.slice(nl + 1); // drop partial leading line
    }
    const objs = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        objs.push(JSON.parse(line));
      } catch (e) {
        /* skip malformed/truncated line */
      }
    }
    return objs;
  } catch (e) {
    return [];
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch (e) {
        /* ignore */
      }
    }
  }
}

// Derive a human summary of a session from its tail objects.
function summarizeSession(objs) {
  let cwd = null;
  let model = null;
  let version = null;
  let gitBranch = null;
  let lastTs = null;
  let lastPrompt = null;

  for (const o of objs) {
    if (o.cwd) cwd = o.cwd;
    if (o.version) version = o.version;
    if (o.gitBranch) gitBranch = o.gitBranch;
    if (o.timestamp) lastTs = o.timestamp;
    if (o.type === 'assistant' && o.message && o.message.model) model = o.message.model;
    if (o.type === 'last-prompt' && o.lastPrompt) lastPrompt = o.lastPrompt;
  }

  const last = objs.length ? objs[objs.length - 1] : null;
  const activity = deriveActivity(objs, last);

  return {
    cwd,
    model,
    version,
    gitBranch,
    lastTs: lastTs ? Date.parse(lastTs) : null,
    lastPrompt,
    state: activity.state,
    detail: activity.detail,
  };
}

// Classify what the agent is doing from the last meaningful transcript entry.
function deriveActivity(objs, last) {
  if (!last) return { state: 'unknown', detail: '' };

  if (last.type === 'assistant' && last.message) {
    const content = Array.isArray(last.message.content) ? last.message.content : [];
    const tools = content.filter((b) => b && b.type === 'tool_use').map((b) => b.name);
    if (tools.length) {
      return { state: 'tool', detail: tools.join(', ') };
    }
    const text = content.find((b) => b && b.type === 'text');
    return { state: 'replied', detail: text ? firstLine(text.text) : '' };
  }

  if (last.type === 'user' && last.message) {
    const content = last.message.content;
    if (Array.isArray(content) && content.some((b) => b && b.type === 'tool_result')) {
      return { state: 'thinking', detail: '' };
    }
    const txt = typeof content === 'string' ? content : '';
    return { state: 'thinking', detail: firstLine(txt) };
  }

  return { state: 'unknown', detail: '' };
}

function firstLine(s) {
  if (!s) return '';
  const line =
    String(s)
      .split('\n')
      .find((l) => l.trim()) || '';
  return line.trim().slice(0, 120);
}

module.exports = { projectsRoot, listSessionFiles, readTailObjects, summarizeSession };
