import assert from 'node:assert/strict';
import { demoAgents } from '../src/demo.ts';

Deno.test('demoAgents returns well-formed records covering all frameworks', () => {
  const agents = demoAgents(1_700_000_000_000);
  assert.ok(agents.length >= 5);
  const kinds = new Set<string>();
  for (const a of agents) {
    assert.equal(typeof a.pid, 'number');
    assert.equal(typeof a.model, 'string');
    assert.ok(a.cpu >= 0);
    assert.ok('state' in a && 'rawState' in a && 'idleSec' in a);
    assert.ok(['claude', 'codex', 'grok', 'gemini', 'agy'].includes(a.agent));
    kinds.add(a.agent);
  }
  for (const k of ['claude', 'codex', 'grok', 'gemini', 'agy']) {
    assert.ok(kinds.has(k), `missing ${k}`);
  }
});

Deno.test('demoAgents is deterministic and animates over time', () => {
  assert.deepEqual(demoAgents(1_700_000_000_000), demoAgents(1_700_000_000_000));
  const a = demoAgents(1_700_000_000_000).map((x) => x.state).join(',');
  const b = demoAgents(1_700_000_000_000 + 3000).map((x) => x.state).join(',');
  assert.notEqual(a, b);
});

Deno.test('demoAgents never leaks a real cwd', () => {
  for (const a of demoAgents(1_700_000_000_000)) {
    assert.match(a.cwd ?? '', /^\/Users\/dev\//);
  }
});
