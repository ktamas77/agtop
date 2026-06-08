'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildFrame, sortAgents, SORTS } = require('../lib/render');
const c = require('../lib/colors');

c.setEnabled(false);

const sample = (over = {}) => ({
  pid: 42,
  cpu: 3.2,
  rssKb: 540000,
  uptimeSec: 419,
  project: 'agtop',
  gitBranch: 'main',
  model: 'claude-opus-4-8',
  idleSec: 5,
  rawState: 'tool',
  detail: 'Bash',
  state: 'working',
  args: 'claude',
  ...over,
});

const opts = (over = {}) => ({
  width: 120,
  height: 20,
  interval: 2,
  sort: 'cpu',
  reverse: false,
  once: true,
  ...over,
});

test('SORTS exposes the expected keys', () => {
  assert.deepEqual(SORTS, ['cpu', 'mem', 'up', 'idle', 'project', 'pid']);
});

test('sortAgents orders by each key and honors reverse', () => {
  const a = { pid: 1, cpu: 1, rssKb: 10, uptimeSec: 5, idleSec: 9, project: 'b' };
  const b = { pid: 2, cpu: 9, rssKb: 30, uptimeSec: 1, idleSec: 1, project: 'a' };
  const ids = (arr) => arr.map((x) => x.pid);
  assert.deepEqual(ids(sortAgents([a, b], 'cpu', false)), [2, 1]);
  assert.deepEqual(ids(sortAgents([a, b], 'cpu', true)), [1, 2]);
  assert.deepEqual(ids(sortAgents([a, b], 'mem', false)), [2, 1]);
  assert.deepEqual(ids(sortAgents([a, b], 'up', false)), [1, 2]);
  assert.deepEqual(ids(sortAgents([a, b], 'idle', false)), [2, 1]);
  assert.deepEqual(ids(sortAgents([a, b], 'project', false)), [2, 1]);
  assert.deepEqual(ids(sortAgents([a, b], 'pid', false)), [1, 2]);
});

test('sortAgents does not mutate its input', () => {
  const arr = [sample({ pid: 1, cpu: 1 }), sample({ pid: 2, cpu: 9 })];
  const copy = arr.slice();
  sortAgents(arr, 'cpu', false);
  assert.deepEqual(arr, copy);
});

test('sortAgents treats missing idle as last', () => {
  const a = { pid: 1, idleSec: null };
  const b = { pid: 2, idleSec: 3 };
  assert.deepEqual(
    sortAgents([a, b], 'idle', false).map((x) => x.pid),
    [2, 1],
  );
});

test('buildFrame includes title, headers, and the agent row', () => {
  const frame = buildFrame([sample()], opts());
  assert.match(frame, /agtop/);
  assert.match(frame, /PROJECT/);
  assert.match(frame, /agtop/);
  assert.match(frame, /1 agent running/);
  assert.match(frame, /Bash/);
});

test('buildFrame pluralizes the agent count', () => {
  const frame = buildFrame([sample(), sample({ pid: 43 })], opts());
  assert.match(frame, /2 agents running/);
});

test('buildFrame shows an empty-state message with zero agents', () => {
  const frame = buildFrame([], opts());
  assert.match(frame, /No running Claude agents/);
});

test('buildFrame every line fits within the terminal width', () => {
  const frame = buildFrame(
    [sample(), sample({ pid: 43, project: 'a-much-longer-project-name' })],
    opts({ width: 80 }),
  );
  for (const line of frame.split('\n')) {
    assert.ok(c.width(line) <= 80, `line exceeds width: "${line}"`);
  }
});

test('buildFrame renders an unknown state without throwing', () => {
  const frame = buildFrame(
    [sample({ state: 'no-session', rawState: 'no-session', model: null })],
    opts(),
  );
  assert.match(frame, /claude/); // falls back to args in the activity column
});
