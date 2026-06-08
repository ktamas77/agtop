// Deno entry point. Deno runs TypeScript natively — no build step.
import { readFileSync } from 'node:fs';
import { run } from './src/cli.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
run(Deno.args, pkg.version);
