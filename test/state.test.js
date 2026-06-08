'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { classifyState, firstLine, gitBranch } = require('../lib/state');

test('classifyState: no-session and missing idle', () => {
  assert.equal(classifyState('no-session', null), 'live');
  assert.equal(classifyState('no-session', 5), 'live');
  assert.equal(classifyState('tool', null), 'idle');
});

test('classifyState: tool -> working / stalled by idle', () => {
  assert.equal(classifyState('tool', 0), 'working');
  assert.equal(classifyState('tool', 119), 'working');
  assert.equal(classifyState('tool', 120), 'stalled');
  assert.equal(classifyState('tool', 999), 'stalled');
});

test('classifyState: thinking -> thinking / stalled by idle', () => {
  assert.equal(classifyState('thinking', 10), 'thinking');
  assert.equal(classifyState('thinking', 121), 'stalled');
});

test('classifyState: replied -> replied / waiting by idle', () => {
  assert.equal(classifyState('replied', 5), 'replied');
  assert.equal(classifyState('replied', 29), 'replied');
  assert.equal(classifyState('replied', 30), 'waiting');
});

test('classifyState: unknown -> active / idle by idle', () => {
  assert.equal(classifyState('unknown', 5), 'active');
  assert.equal(classifyState('unknown', 60), 'idle');
});

test('firstLine returns the first non-empty line, trimmed and capped', () => {
  assert.equal(firstLine('hello\nworld'), 'hello');
  assert.equal(firstLine('\n\n  second\nthird'), 'second');
  assert.equal(firstLine(''), '');
  assert.equal(firstLine(null), '');
  assert.equal(firstLine('x'.repeat(200)).length, 120);
});

test('gitBranch reads .git/HEAD for a ref, null when detached/absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-git-'));
  try {
    fs.mkdirSync(path.join(dir, '.git'));
    fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/feature/x\n');
    assert.equal(gitBranch(dir), 'feature/x');

    fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'a1b2c3d4e5f6\n'); // detached
    assert.equal(gitBranch(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(gitBranch('/no/such/dir'), null);
  assert.equal(gitBranch(null), null);
});
