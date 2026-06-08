import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyState, firstLine, gitBranch } from '../src/state.ts';

Deno.test('classifyState: no-session and missing idle', () => {
  assert.equal(classifyState('no-session', null), 'live');
  assert.equal(classifyState('tool', null), 'idle');
});

Deno.test('classifyState: tool/thinking/replied/unknown by idle thresholds', () => {
  assert.equal(classifyState('tool', 119), 'working');
  assert.equal(classifyState('tool', 120), 'stalled');
  assert.equal(classifyState('thinking', 10), 'thinking');
  assert.equal(classifyState('thinking', 121), 'stalled');
  assert.equal(classifyState('replied', 29), 'replied');
  assert.equal(classifyState('replied', 30), 'waiting');
  assert.equal(classifyState('unknown', 5), 'active');
  assert.equal(classifyState('unknown', 60), 'idle');
});

Deno.test('firstLine returns the first non-empty line, trimmed and capped', () => {
  assert.equal(firstLine('hello\nworld'), 'hello');
  assert.equal(firstLine('\n\n  second\nthird'), 'second');
  assert.equal(firstLine(''), '');
  assert.equal(firstLine(null), '');
  assert.equal(firstLine('x'.repeat(200)).length, 120);
});

Deno.test('gitBranch reads .git/HEAD for a ref, null when detached/absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-git-'));
  try {
    fs.mkdirSync(path.join(dir, '.git'));
    fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/feature/x\n');
    assert.equal(gitBranch(dir), 'feature/x');
    fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'a1b2c3d4\n'); // detached
    assert.equal(gitBranch(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(gitBranch('/no/such/dir'), null);
  assert.equal(gitBranch(null), null);
});
