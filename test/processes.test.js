'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { listAllProcesses, exeBase } = require('../lib/processes');

test('exeBase returns the executable basename', () => {
  assert.equal(exeBase('claude -c'), 'claude');
  assert.equal(exeBase('/opt/homebrew/bin/codex exec'), 'codex');
  assert.equal(exeBase('node /path/cli.js'), 'node');
  assert.equal(exeBase(''), '');
});

test('listAllProcesses returns well-formed records', () => {
  const procs = listAllProcesses();
  assert.ok(Array.isArray(procs));
  assert.ok(procs.length > 0, 'expected at least one running process');
  for (const p of procs.slice(0, 50)) {
    assert.equal(typeof p.pid, 'number');
    assert.ok(Number.isInteger(p.pid) && p.pid > 0);
    assert.equal(typeof p.ppid, 'number');
    assert.ok(Number.isInteger(p.ppid) && p.ppid >= 0);
    assert.equal(typeof p.cpu, 'number');
    assert.equal(typeof p.rssKb, 'number');
    assert.equal(typeof p.uptimeSec, 'number');
    assert.equal(typeof p.args, 'string');
  }
});
