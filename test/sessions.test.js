'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { summarizeSession, readTailObjects } = require('../lib/sessions');

test('summarizeSession extracts metadata from the tail', () => {
  const objs = [
    {
      type: 'user',
      cwd: '/tmp/x',
      version: '2.1.168',
      gitBranch: 'main',
      timestamp: '2026-06-08T00:00:00.000Z',
      message: { content: 'hello' },
    },
    {
      type: 'assistant',
      timestamp: '2026-06-08T00:00:01.000Z',
      message: { model: 'claude-opus-4-8', content: [{ type: 'text', text: 'hi there' }] },
    },
    { type: 'last-prompt', lastPrompt: 'do the thing' },
  ];
  const s = summarizeSession(objs);
  assert.equal(s.cwd, '/tmp/x');
  assert.equal(s.model, 'claude-opus-4-8');
  assert.equal(s.version, '2.1.168');
  assert.equal(s.gitBranch, 'main');
  assert.equal(s.lastPrompt, 'do the thing');
  assert.equal(s.lastTs, Date.parse('2026-06-08T00:00:01.000Z'));
});

test('summarizeSession derives tool state when last message is a tool_use', () => {
  const s = summarizeSession([
    {
      type: 'assistant',
      timestamp: '2026-06-08T00:00:01.000Z',
      message: { model: 'claude-opus-4-8', content: [{ type: 'tool_use', name: 'Bash' }] },
    },
  ]);
  assert.equal(s.state, 'tool');
  assert.equal(s.detail, 'Bash');
});

test('summarizeSession derives replied state for a text-only answer', () => {
  const s = summarizeSession([
    {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'all done\nsecond line' }] },
    },
  ]);
  assert.equal(s.state, 'replied');
  assert.equal(s.detail, 'all done');
});

test('summarizeSession derives thinking state after a tool_result', () => {
  const s = summarizeSession([
    {
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] },
    },
  ]);
  assert.equal(s.state, 'thinking');
});

test('summarizeSession is safe on empty input', () => {
  const s = summarizeSession([]);
  assert.equal(s.cwd, null);
  assert.equal(s.model, null);
  assert.equal(s.state, 'unknown');
});

test('readTailObjects parses JSONL and drops a partial leading line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-'));
  const file = path.join(dir, 's.jsonl');
  try {
    const lines = [];
    for (let i = 0; i < 200; i++) lines.push(JSON.stringify({ type: 'user', n: i }));
    fs.writeFileSync(file, lines.join('\n') + '\n');
    const objs = readTailObjects(file, 512); // small window -> forces partial-line drop
    assert.ok(objs.length > 0 && objs.length < 200);
    // Every returned object parsed cleanly and the last is the final line.
    assert.equal(objs[objs.length - 1].n, 199);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readTailObjects returns [] for a missing file', () => {
  assert.deepEqual(readTailObjects('/no/such/file.jsonl'), []);
});
