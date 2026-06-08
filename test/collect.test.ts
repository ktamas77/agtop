import assert from 'node:assert/strict';
import { classifyState, collectAgents } from '../src/collect.ts';

Deno.test('collect re-exports classifyState', () => {
  assert.equal(typeof classifyState, 'function');
  assert.equal(classifyState('tool', 5), 'working');
});

Deno.test('collectAgents returns well-formed, provider-tagged records', () => {
  const agents = collectAgents();
  assert.ok(Array.isArray(agents));
  const VALID = new Set([
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
    assert.ok(['claude', 'codex', 'grok', 'gemini', 'agy'].includes(a.agent));
    assert.ok(VALID.has(a.state));
    assert.ok('model' in a && 'idleSec' in a);
    assert.equal(typeof a.cpu, 'number');
    assert.ok(a.idleSec === null || typeof a.idleSec === 'number');
  }
});
