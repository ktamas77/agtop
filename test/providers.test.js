'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readTailObjects, readHeadObjects } = require('../lib/jsonl');
const claude = require('../lib/providers/claude');
const codex = require('../lib/providers/codex');

// ---- shared jsonl helpers ----

test('readTailObjects parses JSONL and drops a partial leading line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-'));
  const file = path.join(dir, 's.jsonl');
  try {
    const lines = [];
    for (let i = 0; i < 200; i++) lines.push(JSON.stringify({ type: 'user', n: i }));
    fs.writeFileSync(file, lines.join('\n') + '\n');
    const objs = readTailObjects(file, 512);
    assert.ok(objs.length > 0 && objs.length < 200);
    assert.equal(objs[objs.length - 1].n, 199);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readHeadObjects parses leading lines and drops a partial trailing line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-'));
  const file = path.join(dir, 's.jsonl');
  try {
    const lines = [];
    for (let i = 0; i < 200; i++) lines.push(JSON.stringify({ type: 'session_meta', n: i }));
    fs.writeFileSync(file, lines.join('\n') + '\n');
    const objs = readHeadObjects(file, 256);
    assert.ok(objs.length > 0 && objs.length < 200);
    assert.equal(objs[0].n, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readTailObjects / readHeadObjects return [] for a missing file', () => {
  assert.deepEqual(readTailObjects('/no/such/file.jsonl'), []);
  assert.deepEqual(readHeadObjects('/no/such/file.jsonl'), []);
});

// ---- claude provider ----

test('claude.matchProcess matches the CLI but not the desktop app', () => {
  assert.equal(claude.matchProcess('claude'), true);
  assert.equal(claude.matchProcess('claude -c'), true);
  assert.equal(claude.matchProcess('/opt/homebrew/bin/claude --resume'), true);
  assert.equal(
    claude.matchProcess('node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js'),
    true,
  );
  assert.equal(claude.matchProcess('/Applications/Claude.app/Contents/MacOS/Claude'), false);
  assert.equal(claude.matchProcess('codex'), false);
  assert.equal(claude.matchProcess('vim claude.txt'), false);
});

test('claude.summarize derives state from a transcript tail', () => {
  const s = claude.summarize([
    {
      type: 'user',
      cwd: '/tmp/x',
      gitBranch: 'main',
      timestamp: '2026-06-08T00:00:00.000Z',
      message: { content: 'hi' },
    },
    {
      type: 'assistant',
      timestamp: '2026-06-08T00:00:01.000Z',
      message: { model: 'claude-opus-4-8', content: [{ type: 'tool_use', name: 'Bash' }] },
    },
  ]);
  assert.equal(s.cwd, '/tmp/x');
  assert.equal(s.model, 'claude-opus-4-8');
  assert.equal(s.gitBranch, 'main');
  assert.equal(s.rawState, 'tool');
  assert.equal(s.detail, 'Bash');
});

test('claude.summarize: text reply and empty input', () => {
  const r = claude.summarize([
    { type: 'assistant', message: { content: [{ type: 'text', text: 'all done\nx' }] } },
  ]);
  assert.equal(r.rawState, 'replied');
  assert.equal(r.detail, 'all done');
  const e = claude.summarize([]);
  assert.equal(e.cwd, null);
  assert.equal(e.rawState, 'unknown');
});

// ---- codex provider ----

test('codex.matchProcess matches the codex CLI only', () => {
  assert.equal(codex.matchProcess('codex'), true);
  assert.equal(codex.matchProcess('/opt/homebrew/bin/codex'), true);
  assert.equal(codex.matchProcess('codex exec "do a thing"'), true);
  assert.equal(codex.matchProcess('claude'), false);
  assert.equal(codex.matchProcess('node server.js'), false);
});

test('codex.summarizeTail extracts model and tool activity', () => {
  const s = codex.summarizeTail([
    { type: 'turn_context', payload: { model: 'gpt-5.5', cwd: '/tmp/x' } },
    {
      type: 'response_item',
      timestamp: '2026-06-08T00:00:02.000Z',
      payload: { type: 'function_call', name: 'exec_command' },
    },
  ]);
  assert.equal(s.model, 'gpt-5.5');
  assert.equal(s.rawState, 'tool');
  assert.equal(s.detail, 'Shell'); // exec_command -> friendly label
  assert.equal(s.lastTs, Date.parse('2026-06-08T00:00:02.000Z'));
});

test('codex.summarizeTail: assistant message -> replied, reasoning -> thinking', () => {
  const replied = codex.summarizeTail([
    {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'done\nmore' }],
      },
    },
  ]);
  assert.equal(replied.rawState, 'replied');
  assert.equal(replied.detail, 'done');

  const thinking = codex.summarizeTail([{ type: 'response_item', payload: { type: 'reasoning' } }]);
  assert.equal(thinking.rawState, 'thinking');
});

test('codex.summarizeTail: apply_patch and task_complete', () => {
  const edit = codex.summarizeTail([
    { type: 'response_item', payload: { type: 'custom_tool_call', name: 'apply_patch' } },
  ]);
  assert.equal(edit.rawState, 'tool');
  assert.equal(edit.detail, 'Edit');

  const complete = codex.summarizeTail([
    { type: 'event_msg', payload: { type: 'task_complete', last_agent_message: 'shipped it' } },
  ]);
  assert.equal(complete.rawState, 'replied');
  assert.equal(complete.detail, 'shipped it');
});
