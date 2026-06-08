// Deno entry point. Deno runs TypeScript natively — no build step.
// The version is read from deno.json via a JSON import so it works both locally
// and when run remotely from JSR (where there is no filesystem to read).
import denoConfig from './deno.json' with { type: 'json' };
import { run } from './src/cli.ts';

run(Deno.args, denoConfig.version);
