#!/usr/bin/env node
// npm entry point: a thin shim over the compiled TypeScript in dist/.
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { run } from '../dist/cli.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
run(process.argv.slice(2), pkg.version);
