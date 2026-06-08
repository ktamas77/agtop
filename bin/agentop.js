#!/usr/bin/env node
'use strict';

const { collectAgents } = require('../lib/collect');
const { demoAgents } = require('../lib/demo');
const { buildFrame, sortAgents, SORTS } = require('../lib/render');
const { runLive } = require('../lib/ui');
const c = require('../lib/colors');
const pkg = require('../package.json');

function parseArgs(argv) {
  const opts = {
    interval: 2,
    sort: 'cpu',
    reverse: false,
    once: false,
    json: false,
    demo: false,
    color: undefined,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      case '-v':
      case '--version':
        process.stdout.write(`agentop ${pkg.version}\n`);
        process.exit(0);
        break;
      case '-n':
      case '--once':
        opts.once = true;
        break;
      case '--json':
        opts.json = true;
        opts.once = true;
        break;
      case '--no-color':
        opts.color = false;
        break;
      case '-d':
      case '--interval': {
        const val = parseFloat(args[++i]);
        if (!isFinite(val) || val <= 0) fail(`invalid interval: ${args[i]}`);
        opts.interval = Math.max(1, Math.round(val));
        break;
      }
      case '-s':
      case '--sort': {
        const val = args[++i];
        if (!SORTS.includes(val)) fail(`invalid sort key: ${val} (choose: ${SORTS.join(', ')})`);
        opts.sort = val;
        break;
      }
      case '-r':
      case '--reverse':
        opts.reverse = true;
        break;
      case '--demo':
        opts.demo = true;
        break;
      default:
        fail(`unknown option: ${a}`);
    }
  }
  return opts;
}

function fail(msg) {
  process.stderr.write(`agentop: ${msg}\n`);
  process.stderr.write(`Try 'agentop --help'.\n`);
  process.exit(2);
}

function printHelp() {
  process.stdout.write(`agentop — top, but for your running coding agents (Claude Code + Codex)

USAGE
  agentop [options]

OPTIONS
  -d, --interval <sec>   Refresh interval in seconds (default: 2)
  -s, --sort <key>       Sort by: ${SORTS.join(', ')} (default: cpu)
  -r, --reverse          Reverse sort order
  -n, --once             Print a single snapshot and exit (no live UI)
      --json             Print agents as JSON and exit
      --demo             Show fabricated sample agents (no real data) — handy
                         for previews, screenshots, and demos
      --no-color         Disable ANSI colors
  -h, --help             Show this help
  -v, --version          Show version

LIVE KEYS
  q / Esc / Ctrl-C       Quit
  s                      Cycle sort column
  r                      Reverse sort order
  +/-                    Increase / decrease refresh interval

WHAT IT SHOWS
  Every running 'claude' (Claude Code) and 'codex' (OpenAI Codex) CLI
  session on this machine, joined to its project, git branch, model, and
  current activity — read live from local session state under
  ~/.claude/projects and ~/.codex.
`);
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.color === false) c.setEnabled(false);
  const collect = opts.demo ? demoAgents : collectAgents;

  if (opts.json) {
    const agents = sortAgents(collect(), opts.sort, opts.reverse);
    process.stdout.write(JSON.stringify(agents, null, 2) + '\n');
    return;
  }

  if (opts.once || !process.stdout.isTTY) {
    const agents = sortAgents(collect(), opts.sort, opts.reverse);
    const frame = buildFrame(agents, {
      width: process.stdout.columns || 100,
      height: Math.max(agents.length + 6, 10),
      interval: opts.interval,
      sort: opts.sort,
      reverse: opts.reverse,
      once: true,
    });
    process.stdout.write(frame + '\n');
    return;
  }

  runLive(opts);
}

main();
