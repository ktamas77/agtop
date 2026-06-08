'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyState, collectAgents } = require('../lib/collect');

test('collect re-exports classifyState (shared with state.js)', () => {
  // Detailed behavior is covered in state.test.js; just verify the re-export.
  assert.equal(typeof classifyState, 'function');
  assert.equal(classifyState('tool', 5), 'working');
});

test('collectAgents returns well-formed, provider-tagged records', () => {
  const agents = collectAgents();
  assert.ok(Array.isArray(agents));
  const VALID_STATES = new Set([
    'working',
    'thinking',
    'replied',
    'active',
    'waiting',
    'idle',
    'stalled',
    'live',
  ]);
  for (const a of agents) {
    assert.equal(typeof a.pid, 'number');
    assert.equal(typeof a.project, 'string');
    assert.ok(['claude', 'codex', 'grok'].includes(a.agent), `unexpected agent: ${a.agent}`);
    assert.ok(VALID_STATES.has(a.state), `unexpected state: ${a.state}`);
    assert.ok('model' in a && 'idleSec' in a);
    assert.equal(typeof a.cpu, 'number');
    assert.equal(typeof a.rssKb, 'number');
    assert.ok(a.idleSec === null || typeof a.idleSec === 'number');
  }
});
