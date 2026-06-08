'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shortModel, parseEtime, dur, memFromKb, bytes2human, fit } = require('../lib/format');
const c = require('../lib/colors');

c.setEnabled(false); // deterministic, color-free output for assertions

test('shortModel strips claude- prefix, date stamp, and [1m] suffix', () => {
  assert.equal(shortModel('claude-opus-4-8'), 'opus-4-8');
  assert.equal(shortModel('claude-sonnet-4-6'), 'sonnet-4-6');
  assert.equal(shortModel('claude-haiku-4-5-20251001'), 'haiku-4-5');
  assert.equal(shortModel('claude-opus-4-8[1m]'), 'opus-4-8');
  assert.equal(shortModel(null), '?');
  assert.equal(shortModel(undefined), '?');
});

test('parseEtime handles SS, MM:SS, HH:MM:SS and DD-HH:MM:SS', () => {
  assert.equal(parseEtime('45'), 45);
  assert.equal(parseEtime('01:10'), 70);
  assert.equal(parseEtime('22:49'), 1369);
  assert.equal(parseEtime('1:02:03'), 3723);
  assert.equal(parseEtime('2-03:00:00'), 2 * 86400 + 3 * 3600);
  assert.equal(parseEtime(''), 0);
});

test('dur formats compactly across magnitudes', () => {
  assert.equal(dur(0), '0s');
  assert.equal(dur(9), '9s');
  assert.equal(dur(59), '59s');
  assert.equal(dur(60), '1m');
  assert.equal(dur(70), '1m');
  assert.equal(dur(3600), '1h');
  assert.equal(dur(3723), '1h02');
  assert.equal(dur(2 * 86400 + 3 * 3600), '2d3h');
  assert.equal(dur(null), '-');
  assert.equal(dur(Infinity), '-');
});

test('bytes2human and memFromKb', () => {
  assert.equal(bytes2human(0), '0B');
  assert.equal(bytes2human(512), '512B');
  assert.equal(bytes2human(1024), '1.0K');
  assert.equal(memFromKb(540000), '527M');
  assert.equal(memFromKb(1024 * 1024), '1.0G');
  assert.equal(memFromKb(null), '-');
});

test('fit pads to exact width and aligns', () => {
  assert.equal(fit('hi', 5), 'hi   ');
  assert.equal(fit('hi', 5, 'right'), '   hi');
  assert.equal(fit('exact', 5), 'exact');
  assert.equal(fit('', 3), '   ');
  assert.equal(fit(null, 2), '  ');
});

test('fit truncates with an ellipsis and keeps exact visible width', () => {
  const out = fit('a very long string', 6);
  assert.equal(c.width(out), 6);
  assert.ok(out.endsWith('…'));
  assert.equal(fit('abc', 1), 'a');
});
