import assert from 'node:assert/strict';
import { buildFrame, sortAgents, SORTS } from '../src/render.ts';
import c from '../src/colors.ts';
import type { Agent } from '../src/types.ts';

c.setEnabled(false);

const sample = (over: Partial<Agent> = {}): Agent => ({
  pid: 42,
  agent: 'claude',
  cpu: 3.2,
  rssKb: 540000,
  uptimeSec: 419,
  cwd: '/x',
  project: 'agentop',
  args: 'claude',
  model: 'claude-opus-4-8',
  version: null,
  gitBranch: 'main',
  sessionId: null,
  lastPrompt: null,
  lastTs: null,
  idleSec: 5,
  rawState: 'tool',
  detail: 'Bash',
  state: 'working',
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

Deno.test('SORTS exposes the expected keys', () => {
  assert.deepEqual(SORTS, ['cpu', 'mem', 'up', 'idle', 'project', 'pid']);
});

Deno.test('sortAgents orders by each key and honors reverse', () => {
  const a = sample({ pid: 1, cpu: 1, rssKb: 10, uptimeSec: 5, idleSec: 9, project: 'b' });
  const b = sample({ pid: 2, cpu: 9, rssKb: 30, uptimeSec: 1, idleSec: 1, project: 'a' });
  const ids = (arr: Agent[]) => arr.map((x) => x.pid);
  assert.deepEqual(ids(sortAgents([a, b], 'cpu', false)), [2, 1]);
  assert.deepEqual(ids(sortAgents([a, b], 'cpu', true)), [1, 2]);
  assert.deepEqual(ids(sortAgents([a, b], 'project', false)), [2, 1]);
  assert.deepEqual(ids(sortAgents([a, b], 'pid', false)), [1, 2]);
});

Deno.test('buildFrame includes title, AGENT column, and the agent row', () => {
  const frame = buildFrame([sample()], opts());
  assert.match(frame, /agentop/);
  assert.match(frame, /AGENT/);
  assert.match(frame, /PROJECT/);
  assert.match(frame, /claude/);
  assert.match(frame, /1 agent running/);
  assert.match(frame, /Bash/);
});

Deno.test('buildFrame shows shipped provider rows with models', () => {
  const frame = buildFrame(
    [
      sample({ agent: 'codex', model: 'gpt-5.5' }),
      sample({ pid: 43, agent: 'grok', model: 'grok-4' }),
      sample({ pid: 44, agent: 'gemini', model: 'gemini-3-flash' }),
      sample({ pid: 45, agent: 'agy', model: 'gemini-3.5-flash' }),
      sample({ pid: 46, agent: 'pi', model: 'claude-sonnet-4-5' }),
      sample({ pid: 47, agent: 'hermes', model: 'nous/hermes-4' }),
      sample({ pid: 48, agent: 'opencode', model: 'anthropic/claude-sonnet-4-5' }),
    ],
    opts(),
  );
  for (
    const s of [
      'codex',
      'gpt-5.5',
      'grok',
      'grok-4',
      'gemini',
      'gemini-3-flash',
      'agy',
      'pi',
      'hermes',
      'opencode',
    ]
  ) {
    assert.match(frame, new RegExp(s.replace(/[.]/g, '\\.')));
  }
});

Deno.test('buildFrame shows an empty-state message with zero agents', () => {
  assert.match(buildFrame([], opts()), /No running agents/);
});

Deno.test('sortAgents pins subagents directly under their parent', () => {
  const p1 = sample({ pid: 1, cpu: 1 });
  const p2 = sample({ pid: 2, cpu: 9 });
  const s1 = sample({ pid: 1, parentPid: 1, slug: 'sub-a', cpu: 0 });
  const order = sortAgents([s1, p1, p2], 'cpu', false).map((x) => x.slug ?? `p${x.pid}`);
  // p2 (higher cpu) first, then p1 immediately followed by its subagent.
  assert.deepEqual(order, ['p2', 'p1', 'sub-a']);
});

Deno.test('buildFrame renders a subagent as a SUB / ↳parent row, excluded from the count', () => {
  const frame = buildFrame(
    [
      sample({ pid: 99 }),
      sample({ pid: 99, parentPid: 99, slug: 'review:bugs', model: 'claude-haiku-4-5' }),
    ],
    opts(),
  );
  assert.match(frame, /1 agent · 1 subagent running/); // count excludes the subagent
  assert.match(frame, /SUB/);
  assert.match(frame, /↳99/);
  assert.match(frame, /review:bugs/); // slug shown in the project column
  const subLine = frame.split('\n').find((l) => l.includes('↳99'))!;
  assert.ok(!/\d+\.\d/.test(subLine), `subagent row should not show cpu: "${subLine}"`);
});

Deno.test('buildFrame: every line fits within the terminal width at narrow sizes', () => {
  for (const width of [200, 80, 40, 20]) {
    const frame = buildFrame(
      [sample(), sample({ pid: 43, project: 'a-much-longer-project' })],
      opts({ width, once: false }),
    );
    for (const line of frame.split('\n')) {
      assert.ok(c.width(line) <= width, `width ${width} exceeded by: "${line}"`);
    }
  }
  for (const width of [80, 30, 12]) {
    for (const line of buildFrame([], opts({ width, once: false })).split('\n')) {
      assert.ok(c.width(line) <= width);
    }
  }
});
