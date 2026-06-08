'use strict';

const fs = require('fs');

// Parse a chunk of newline-delimited JSON into objects, skipping blank/broken lines.
function parseLines(text) {
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
}

// Read the last `bytes` of a file and return parsed JSONL objects (dropping a
// partial leading line). Cheap way to inspect a long transcript's recent tail.
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
    return parseLines(text);
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

// Read the first `bytes` of a file and return parsed JSONL objects (dropping a
// partial trailing line). Used to read a session's leading metadata cheaply.
function readHeadObjects(file, bytes = 8 * 1024) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const { size } = fs.fstatSync(fd);
    const len = Math.min(size, bytes);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, 0);
    let text = buf.toString('utf8');
    if (len < size) {
      const nl = text.lastIndexOf('\n');
      if (nl !== -1) text = text.slice(0, nl); // drop partial trailing line
    }
    return parseLines(text);
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

module.exports = { readTailObjects, readHeadObjects, parseLines };
