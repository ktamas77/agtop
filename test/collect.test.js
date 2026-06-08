'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyState, collectAgents } = require('../lib/collect');

test('classifyState maps tool activity to working/stalled by idle time', () => {
  assert.equal(classifyState('tool', 5), 'working');
  assert.equal(classifyState('tool', 119), 'working');
  assert.equal(classifyState('tool', 121), 'stalled');
});

test('classifyState maps thinking activity to thinking/stalled by idle time', () => {
  assert.equal(classifyState('thinking', 5), 'thinking');
  assert.equal(classifyState('thinking', 200), 'stalled');
});

test('classifyState maps replied activity to replied/waiting by idle time', () => {
  assert.equal(classifyState('replied', 5), 'replied');
  assert.equal(classifyState('replied', 60), 'waiting');
});

test('classifyState handles no-session and missing idle', () => {
  assert.equal(classifyState('no-session', null), 'live');
  assert.equal(classifyState('tool', null), 'idle');
  assert.equal(classifyState('unknown', 5), 'active');
  assert.equal(classifyState('unknown', 60), 'idle');
});

test('collectAgents returns well-formed records for the live machine', () => {
  const agents = collectAgents();
  assert.ok(Array.isArray(agents));
  for (const a of agents) {
    assert.equal(typeof a.pid, 'number');
    assert.equal(typeof a.project, 'string');
    assert.ok('model' in a);
    assert.ok('state' in a);
    assert.ok('idleSec' in a);
    assert.ok(typeof a.cpu === 'number');
    assert.ok(typeof a.rssKb === 'number');
  }
});
