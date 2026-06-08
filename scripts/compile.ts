// Build a standalone agentop binary with `deno compile`.
//
// Usage:
//   deno task compile                      → host binary at dist-bin/agentop
//   deno task compile <target-triple>      → cross-compiled binary at
//                                            dist-bin/agentop-<target-triple>
//
// The optional target triple is passed to `deno compile` BEFORE the entry
// module. `deno compile` treats any argument after the entry script as a
// script argument, not a compile flag — so a trailing `--target` is silently
// ignored and you get a host binary. This helper exists to order the flags
// correctly and to give CI (Phase 6) a single reusable builder that also names
// outputs per target.

const target = Deno.args[0];
const outDir = 'dist-bin';
await Deno.mkdir(outDir, { recursive: true });

const output = target ? `${outDir}/agentop-${target}` : `${outDir}/agentop`;

const args = ['compile', '-A'];
if (target) args.push('--target', target);
args.push('--output', output, 'main.ts');

const { code } = await new Deno.Command('deno', {
  args,
  stdout: 'inherit',
  stderr: 'inherit',
}).output();

if (code !== 0) Deno.exit(code);
console.log(`Built ${output}`);
