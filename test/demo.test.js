'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { demoAgents } = require('../lib/demo');

test('demoAgents returns a stable set of well-formed records', () => {
  const agents = demoAgents(1_700_000_000_000);
  assert.ok(Array.isArray(agents) && agents.length >= 5);
  for (const a of agents) {
    assert.equal(typeof a.pid, 'number');
    assert.equal(typeof a.project, 'string');
    assert.equal(typeof a.model, 'string');
    assert.equal(typeof a.cpu, 'number');
    assert.ok(a.cpu >= 0);
    assert.ok('state' in a && 'rawState' in a && 'idleSec' in a);
    assert.ok(['claude', 'codex', 'grok', 'gemini', 'agy'].includes(a.agent));
  }
});

test('demoAgents includes all supported agent frameworks', () => {
  const agents = demoAgents(1_700_000_000_000);
  const kinds = new Set(agents.map((a) => a.agent));
  for (const k of ['claude', 'codex', 'grok', 'gemini', 'agy'])
    assert.ok(kinds.has(k), `missing ${k}`);
});

test('demoAgents is deterministic for a fixed timestamp', () => {
  assert.deepEqual(demoAgents(1_700_000_000_000), demoAgents(1_700_000_000_000));
});

test('demoAgents animates: state changes over time', () => {
  const a = demoAgents(1_700_000_000_000);
  const b = demoAgents(1_700_000_000_000 + 3000);
  const statesA = a.map((x) => x.state).join(',');
  const statesB = b.map((x) => x.state).join(',');
  assert.notEqual(statesA, statesB);
});

test('demoAgents never leaks a real cwd (uses fabricated paths)', () => {
  for (const a of demoAgents(1_700_000_000_000)) {
    assert.match(a.cwd, /^\/Users\/dev\//);
  }
});
