'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildFrame, sortAgents, SORTS } = require('../lib/render');
const c = require('../lib/colors');

c.setEnabled(false);

const sample = (over = {}) => ({
  pid: 42,
  agent: 'claude',
  cpu: 3.2,
  rssKb: 540000,
  uptimeSec: 419,
  project: 'agentop',
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
  assert.match(frame, /agentop/);
  assert.match(frame, /AGENT/);
  assert.match(frame, /PROJECT/);
  assert.match(frame, /claude/);
  assert.match(frame, /1 agent running/);
  assert.match(frame, /Bash/);
});

test('buildFrame shows the codex agent and its model', () => {
  const frame = buildFrame([sample({ agent: 'codex', model: 'gpt-5.5', project: 'web' })], opts());
  assert.match(frame, /codex/);
  assert.match(frame, /gpt-5\.5/);
});

test('buildFrame pluralizes the agent count', () => {
  const frame = buildFrame([sample(), sample({ pid: 43 })], opts());
  assert.match(frame, /2 agents running/);
});

test('buildFrame shows an empty-state message with zero agents', () => {
  const frame = buildFrame([], opts());
  assert.match(frame, /No running agents/);
});

test('buildFrame every line fits within the terminal width (incl. header/empty)', () => {
  // Cover narrow widths where the header, rows, footer, and empty-state can all
  // overflow — regression guard for long hostnames on CI runners.
  const cases = [
    {
      agents: [sample(), sample({ pid: 43, project: 'a-much-longer-project-name' })],
      widths: [200, 80, 40, 20],
    },
    { agents: [], widths: [80, 30, 12] }, // empty-state lines must fit too
  ];
  for (const { agents, widths } of cases) {
    for (const width of widths) {
      const frame = buildFrame(agents, opts({ width, once: false }));
      for (const line of frame.split('\n')) {
        assert.ok(c.width(line) <= width, `width ${width} exceeded by: "${line}"`);
      }
    }
  }
});

test('buildFrame renders an unknown state without throwing', () => {
  const frame = buildFrame(
    [sample({ state: 'no-session', rawState: 'no-session', model: null })],
    opts(),
  );
  assert.match(frame, /claude/); // falls back to args in the activity column
});
