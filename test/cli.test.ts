import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MAIN = new URL('../main.ts', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  const out = new Deno.Command(Deno.execPath(), {
    args: ['run', '-A', MAIN, ...args],
    stdout: 'piped',
    stderr: 'piped',
  }).outputSync();
  return {
    code: out.code,
    stdout: new TextDecoder().decode(out.stdout),
    stderr: new TextDecoder().decode(out.stderr),
  };
}

Deno.test('--version prints the package version', () => {
  assert.equal(run(['--version']).stdout.trim(), `agentop ${pkg.version}`);
});

Deno.test('--help documents usage and options', () => {
  const out = run(['--help']).stdout;
  assert.match(out, /USAGE/);
  assert.match(out, /agentop \[options\]/);
  assert.match(out, /--json/);
});

Deno.test('--json emits valid JSON', () => {
  const agents = JSON.parse(run(['--json']).stdout);
  assert.ok(Array.isArray(agents));
});

Deno.test('--demo --once prints a snapshot with headers', () => {
  const out = run(['--demo', '--once', '--no-color']).stdout;
  assert.match(out, /agentop/);
  assert.match(out, /AGENT/);
  assert.match(out, /6 agents running/);
});

Deno.test('unknown flag / invalid sort exit non-zero with a message', () => {
  const bad = run(['--bogus']);
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /unknown option/);
  const badSort = run(['--sort', 'nope']);
  assert.equal(badSort.code, 2);
  assert.match(badSort.stderr, /invalid sort key/);
});
