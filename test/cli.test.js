'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const BIN = path.join(__dirname, '..', 'bin', 'agtop.js');
const pkg = require('../package.json');

function run(args, opts = {}) {
  return execFileSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    timeout: 15000,
    ...opts,
  });
}

test('--version prints the package version', () => {
  assert.equal(run(['--version']).trim(), `agtop ${pkg.version}`);
});

test('--help documents usage and options', () => {
  const out = run(['--help']);
  assert.match(out, /USAGE/);
  assert.match(out, /agtop \[options\]/);
  assert.match(out, /--json/);
  assert.match(out, /--interval/);
});

test('--json emits valid, well-formed JSON', () => {
  const out = run(['--json']);
  const agents = JSON.parse(out);
  assert.ok(Array.isArray(agents));
  for (const a of agents) {
    assert.equal(typeof a.pid, 'number');
    assert.ok('project' in a && 'state' in a);
  }
});

test('--once prints a single snapshot frame with headers', () => {
  const out = run(['--once', '--no-color']);
  assert.match(out, /agtop/);
  assert.match(out, /PROJECT/);
  assert.match(out, /running/);
});

test('an unknown flag exits non-zero with a helpful message', () => {
  assert.throws(
    () => run(['--bogus'], { stdio: 'pipe' }),
    (/** @type {any} */ err) => {
      assert.equal(err.status, 2);
      assert.match(String(err.stderr), /unknown option/);
      return true;
    },
  );
});

test('an invalid sort key is rejected', () => {
  assert.throws(
    () => run(['--sort', 'nope'], { stdio: 'pipe' }),
    (/** @type {any} */ err) => {
      assert.equal(err.status, 2);
      assert.match(String(err.stderr), /invalid sort key/);
      return true;
    },
  );
});
