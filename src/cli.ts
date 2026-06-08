import { collectAgents } from './collect.ts';
import { demoAgents } from './demo.ts';
import { buildFrame, sortAgents, SORTS } from './render.ts';
import { runLive } from './ui.ts';
import colors from './colors.ts';
import * as platform from './platform.ts';

interface Opts {
  interval: number;
  sort: string;
  reverse: boolean;
  once: boolean;
  json: boolean;
  demo: boolean;
  color: boolean | undefined;
}

function fail(msg: string): never {
  console.error(`agentop: ${msg}`);
  console.error(`Try 'agentop --help'.`);
  platform.exit(2);
  throw new Error(msg); // unreachable; satisfies `never`
}

function printHelp(): void {
  platform.write(
    `agentop — top, but for your running coding agents (Claude, Codex, Grok, Gemini, Antigravity, Pi, Hermes, OpenCode)

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
  Every running 'claude' (Claude Code), 'codex' (OpenAI Codex), 'grok'
  (xAI Grok), 'gemini' (Google Gemini), 'agy' (Google Antigravity),
  'pi' (Earendil Pi), 'hermes' (Hermes Agent), and 'opencode'
  CLI session on this machine, joined to its project, git branch, model,
  and current activity — read live from local session state under
  ~/.claude, ~/.codex, ~/.grok, ~/.gemini, ~/.pi, ~/.hermes, and
  ~/.local/share/opencode.
`,
  );
}

function parseArgs(args: string[], version: string): Opts {
  const opts: Opts = {
    interval: 2,
    sort: 'cpu',
    reverse: false,
    once: false,
    json: false,
    demo: false,
    color: undefined,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case '-h':
      case '--help':
        printHelp();
        platform.exit(0);
        break;
      case '-v':
      case '--version':
        platform.write(`agentop ${version}\n`);
        platform.exit(0);
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
        if (!(SORTS as string[]).includes(val)) {
          fail(`invalid sort key: ${val} (choose: ${SORTS.join(', ')})`);
        }
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

export function run(args: string[], version: string): void {
  const opts = parseArgs(args, version);
  colors.setEnabled(
    opts.color !== false && platform.isTTY('stdout') && !platform.env('NO_COLOR'),
  );
  const collect = opts.demo ? demoAgents : collectAgents;

  if (opts.json) {
    const agents = sortAgents(collect(), opts.sort, opts.reverse);
    platform.write(JSON.stringify(agents, null, 2) + '\n');
    return;
  }

  if (opts.once || !platform.isTTY('stdout')) {
    const agents = sortAgents(collect(), opts.sort, opts.reverse);
    const { columns } = platform.consoleSize();
    const frame = buildFrame(agents, {
      width: columns,
      height: Math.max(agents.length + 6, 10),
      interval: opts.interval,
      sort: opts.sort,
      reverse: opts.reverse,
      once: true,
    });
    platform.write(frame + '\n');
    return;
  }

  runLive(opts);
}
