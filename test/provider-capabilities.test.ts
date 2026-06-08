import assert from 'node:assert/strict';
import {
  allProviders,
  CAPABILITIES,
  plannedProviders,
  PROVIDERS,
} from '../src/provider-capabilities.ts';

Deno.test('capability metadata includes current and conditional providers', () => {
  const names = new Set(PROVIDERS.map((p) => p.name));
  for (const name of ['claude', 'codex', 'grok', 'gemini', 'agy', 'hermes', 'pi', 'opencode']) {
    assert.ok(names.has(name), `missing ${name}`);
  }
});

Deno.test('all provider records cover the same capability keys', () => {
  for (const provider of PROVIDERS) {
    assert.deepEqual(provider.capabilities, CAPABILITIES);
    assert.equal(typeof provider.source, 'string');
  }
});

Deno.test('gsd-pi is conditional, not mandatory', () => {
  const gsdPi = PROVIDERS.find((p) => p.name === 'gsd-pi');
  assert.equal(gsdPi?.status, 'conditional');
  assert.match(gsdPi?.condition || '', /base Pi/);
});

Deno.test('metadata accessors return defensive arrays', () => {
  assert.notEqual(allProviders(), PROVIDERS);
  assert.deepEqual(
    plannedProviders().map((p) => p.name),
    ['gsd-pi'],
  );
});
