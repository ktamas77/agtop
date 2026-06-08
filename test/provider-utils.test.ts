import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  commandBase,
  hasExecutable,
  listNewest,
  nodeShimHas,
  readJsonFile,
  safeJsonParse,
  sanitizeAgentRecord,
  sanitizeText,
  tokenizeArgs,
  xdgDataHome,
} from '../src/provider-utils.ts';

Deno.test('argv helpers match conservative executable shapes', () => {
  assert.deepEqual(tokenizeArgs('  node /tmp/bin/pi --session x '), [
    'node',
    '/tmp/bin/pi',
    '--session',
    'x',
  ]);
  assert.equal(commandBase('/opt/bin/opencode run'), 'opencode');
  assert.equal(hasExecutable('/opt/bin/hermes chat', 'hermes'), true);
  assert.equal(hasExecutable('node /opt/bin/hermes', 'hermes'), false);
  assert.equal(nodeShimHas('node /opt/bin/hermes --x', 'hermes'), true);
  assert.equal(nodeShimHas('node /opt/lib/cli.js --x', 'hermes', 'hermes'), false);
  assert.equal(nodeShimHas('node /opt/hermes/cli.js --x', 'hermes', 'hermes'), true);
});

Deno.test('sanitizeText removes terminal controls and normalizes whitespace', () => {
  assert.equal(sanitizeText('\x1b[31mred\x1b[0m\nnext\tline\x07'), 'red next line');
  assert.equal(sanitizeText('abcdef', 3), 'abc');
  assert.equal(sanitizeText(null), null);
});

Deno.test('sanitizeAgentRecord sanitizes string fields and preserves numbers', () => {
  const safe = sanitizeAgentRecord({
    agent: 'pi\x1b[31m',
    pid: 12,
    cpu: 4.5,
    project: 'proj\nname',
    detail: '\x1b]0;title\x07danger',
  });
  assert.deepEqual(safe, {
    agent: 'pi',
    pid: 12,
    cpu: 4.5,
    project: 'proj name',
    detail: 'danger',
  });
});

Deno.test('safeJsonParse and readJsonFile fail soft', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-utils-'));
  try {
    const file = path.join(dir, 'data.json');
    fs.writeFileSync(file, '{"ok":true}');
    assert.deepEqual(safeJsonParse('{"x":1}', null), { x: 1 });
    assert.deepEqual(safeJsonParse('{bad', { fallback: true }), { fallback: true });
    assert.deepEqual(readJsonFile(file, null), { ok: true });
    assert.deepEqual(readJsonFile(path.join(dir, 'missing.json'), []), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

Deno.test('listNewest returns newest matching files with a limit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-utils-'));
  try {
    const a = path.join(dir, 'a.jsonl');
    const b = path.join(dir, 'b.txt');
    const cFile = path.join(dir, 'c.jsonl');
    fs.writeFileSync(a, 'a');
    fs.writeFileSync(b, 'b');
    fs.writeFileSync(cFile, 'c');
    const now = Date.now();
    fs.utimesSync(a, now / 1000 - 20, now / 1000 - 20);
    fs.utimesSync(cFile, now / 1000, now / 1000);
    const files = listNewest(dir, (file) => file.endsWith('.jsonl'), 1);
    assert.equal(files.length, 1);
    assert.equal(path.basename(files[0].file), 'c.jsonl');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

Deno.test('xdgDataHome honors XDG_DATA_HOME', () => {
  assert.equal(xdgDataHome('opencode', { XDG_DATA_HOME: '/tmp/data' }), '/tmp/data/opencode');
});
