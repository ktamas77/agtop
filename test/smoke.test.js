'use strict';

// Dependency-free smoke tests. Run with: node test/smoke.test.js
const assert = require('assert');
const { shortModel, parseEtime, dur, memFromKb, fit } = require('../lib/format');
const { isClaudeCli } = require('../lib/processes');
const { buildFrame, sortAgents, SORTS } = require('../lib/render');
const { summarizeSession } = require('../lib/sessions');
const c = require('../lib/colors');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  process.stdout.write(`  ✓ ${name}\n`);
}

c.setEnabled(false); // deterministic output for assertions

test('shortModel strips prefix, date, and context suffix', () => {
  assert.strictEqual(shortModel('claude-opus-4-8'), 'opus-4-8');
  assert.strictEqual(shortModel('claude-haiku-4-5-20251001'), 'haiku-4-5');
  assert.strictEqual(shortModel('claude-opus-4-8[1m]'), 'opus-4-8');
  assert.strictEqual(shortModel(null), '?');
});

test('parseEtime handles MM:SS, HH:MM:SS and DD-HH:MM:SS', () => {
  assert.strictEqual(parseEtime('01:10'), 70);
  assert.strictEqual(parseEtime('22:49'), 1369);
  assert.strictEqual(parseEtime('1:02:03'), 3723);
  assert.strictEqual(parseEtime('2-03:00:00'), 2 * 86400 + 3 * 3600);
});

test('dur formats compactly', () => {
  assert.strictEqual(dur(9), '9s');
  assert.strictEqual(dur(70), '1m');
  assert.strictEqual(dur(3723), '1h02');
  assert.strictEqual(dur(2 * 86400 + 3 * 3600), '2d3h');
});

test('memFromKb is human readable', () => {
  assert.strictEqual(memFromKb(540000), '527M');
  assert.strictEqual(memFromKb(1024 * 1024), '1.0G');
});

test('fit pads and truncates to exact width', () => {
  assert.strictEqual(fit('hi', 5), 'hi   ');
  assert.strictEqual(fit('hi', 5, 'right'), '   hi');
  assert.strictEqual(c.width(fit('a very long string', 6)), 6);
  assert.ok(fit('a very long string', 6).endsWith('…'));
});

test('isClaudeCli matches CLI but not desktop app', () => {
  assert.strictEqual(isClaudeCli('claude'), true);
  assert.strictEqual(isClaudeCli('claude -c'), true);
  assert.strictEqual(isClaudeCli('/opt/homebrew/bin/claude --resume'), true);
  assert.strictEqual(isClaudeCli('/Applications/Claude.app/Contents/MacOS/Claude'), false);
  assert.strictEqual(isClaudeCli('node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js'), true);
  assert.strictEqual(isClaudeCli('vim claude.txt'), false);
  assert.strictEqual(isClaudeCli('node server.js'), false);
});

test('summarizeSession derives state from transcript tail', () => {
  const objs = [
    { type: 'user', cwd: '/tmp/x', version: '2.1.168', gitBranch: 'main', timestamp: '2026-06-08T00:00:00.000Z', message: { content: 'hello' } },
    { type: 'assistant', timestamp: '2026-06-08T00:00:01.000Z', message: { model: 'claude-opus-4-8', content: [{ type: 'tool_use', name: 'Bash' }] } },
  ];
  const s = summarizeSession(objs);
  assert.strictEqual(s.cwd, '/tmp/x');
  assert.strictEqual(s.model, 'claude-opus-4-8');
  assert.strictEqual(s.gitBranch, 'main');
  assert.strictEqual(s.state, 'tool');
  assert.strictEqual(s.detail, 'Bash');
});

test('sortAgents orders by key and respects reverse', () => {
  const agents = [
    { pid: 1, cpu: 1, rssKb: 10, uptimeSec: 5, idleSec: 9, project: 'b' },
    { pid: 2, cpu: 9, rssKb: 30, uptimeSec: 1, idleSec: 1, project: 'a' },
  ];
  assert.deepStrictEqual(sortAgents(agents, 'cpu', false).map((a) => a.pid), [2, 1]);
  assert.deepStrictEqual(sortAgents(agents, 'cpu', true).map((a) => a.pid), [1, 2]);
  assert.deepStrictEqual(sortAgents(agents, 'project', false).map((a) => a.pid), [2, 1]);
  assert.ok(SORTS.includes('mem'));
});

test('buildFrame renders without throwing and includes headers', () => {
  const agents = [
    { pid: 42, cpu: 3.2, rssKb: 540000, uptimeSec: 419, project: 'atop', gitBranch: 'main', model: 'claude-opus-4-8', idleSec: 5, rawState: 'tool', detail: 'Bash', state: 'working', args: 'claude' },
  ];
  const frame = buildFrame(agents, { width: 120, height: 20, interval: 2, sort: 'cpu', reverse: false, once: true });
  assert.ok(frame.includes('PROJECT'));
  assert.ok(frame.includes('atop'));
  assert.ok(frame.includes('1 agent running'));
});

test('buildFrame handles zero agents gracefully', () => {
  const frame = buildFrame([], { width: 100, height: 20, interval: 2, sort: 'cpu', reverse: false, once: true });
  assert.ok(frame.includes('No running Claude agents'));
});

process.stdout.write(`\n${passed} tests passed\n`);
