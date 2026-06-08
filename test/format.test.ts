import assert from 'node:assert/strict';
import { bytes2human, dur, fit, memFromKb, parseEtime, shortModel } from '../src/format.ts';
import c from '../src/colors.ts';

c.setEnabled(false); // deterministic, color-free output for assertions

Deno.test('shortModel strips prefix, date stamp, channel + context suffixes', () => {
  assert.equal(shortModel('claude-opus-4-8'), 'opus-4-8');
  assert.equal(shortModel('claude-haiku-4-5-20251001'), 'haiku-4-5');
  assert.equal(shortModel('claude-opus-4-8[1m]'), 'opus-4-8');
  assert.equal(shortModel('gemini-3-flash-preview'), 'gemini-3-flash');
  assert.equal(shortModel('grok-build'), 'grok-build');
  assert.equal(shortModel('gpt-5.5'), 'gpt-5.5');
  assert.equal(shortModel(null), '?');
  assert.equal(shortModel(undefined), '?');
});

Deno.test('parseEtime handles SS, MM:SS, HH:MM:SS and DD-HH:MM:SS', () => {
  assert.equal(parseEtime('45'), 45);
  assert.equal(parseEtime('01:10'), 70);
  assert.equal(parseEtime('1:02:03'), 3723);
  assert.equal(parseEtime('2-03:00:00'), 2 * 86400 + 3 * 3600);
  assert.equal(parseEtime(''), 0);
});

Deno.test('dur formats compactly across magnitudes', () => {
  assert.equal(dur(0), '0s');
  assert.equal(dur(59), '59s');
  assert.equal(dur(60), '1m');
  assert.equal(dur(3600), '1h');
  assert.equal(dur(3723), '1h02');
  assert.equal(dur(2 * 86400 + 3 * 3600), '2d3h');
  assert.equal(dur(null), '-');
  assert.equal(dur(Infinity), '-');
});

Deno.test('bytes2human and memFromKb', () => {
  assert.equal(bytes2human(0), '0B');
  assert.equal(bytes2human(1024), '1.0K');
  assert.equal(memFromKb(540000), '527M');
  assert.equal(memFromKb(1024 * 1024), '1.0G');
  assert.equal(memFromKb(null), '-');
});

Deno.test('fit pads/aligns and truncates with an ellipsis at exact width', () => {
  assert.equal(fit('hi', 5), 'hi   ');
  assert.equal(fit('hi', 5, 'right'), '   hi');
  assert.equal(fit('exact', 5), 'exact');
  assert.equal(fit(null, 2), '  ');
  const out = fit('a very long string', 6);
  assert.equal(c.width(out), 6);
  assert.ok(out.endsWith('…'));
});
