'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isClaudeCli, listClaudeProcesses } = require('../lib/processes');

test('isClaudeCli matches the CLI invocation forms', () => {
  assert.equal(isClaudeCli('claude'), true);
  assert.equal(isClaudeCli('claude -c'), true);
  assert.equal(isClaudeCli('claude --resume foo'), true);
  assert.equal(isClaudeCli('/opt/homebrew/bin/claude'), true);
  assert.equal(isClaudeCli('/usr/local/bin/claude --dangerously-skip-permissions'), true);
  assert.equal(isClaudeCli('node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js'), true);
});

test('isClaudeCli rejects the desktop app, helpers, and unrelated processes', () => {
  assert.equal(isClaudeCli('/Applications/Claude.app/Contents/MacOS/Claude'), false);
  assert.equal(isClaudeCli('/Applications/Claude.app/Contents/Frameworks/Claude Helper'), false);
  assert.equal(isClaudeCli('vim claude.txt'), false);
  assert.equal(isClaudeCli('node server.js'), false);
  assert.equal(isClaudeCli('grep claude foo.log'), false);
  assert.equal(isClaudeCli(''), false);
  assert.equal(isClaudeCli(null), false);
});

test('listClaudeProcesses returns well-formed records (or empty)', () => {
  const procs = listClaudeProcesses();
  assert.ok(Array.isArray(procs));
  for (const p of procs) {
    assert.equal(typeof p.pid, 'number');
    assert.ok(Number.isInteger(p.pid) && p.pid > 0);
    assert.equal(typeof p.cpu, 'number');
    assert.equal(typeof p.rssKb, 'number');
    assert.equal(typeof p.uptimeSec, 'number');
    assert.equal(typeof p.args, 'string');
    assert.ok(isClaudeCli(p.args), `expected a claude CLI: ${p.args}`);
  }
});
