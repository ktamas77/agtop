# atop

> `top`, but for your running **Claude Code agents**.

A zero-dependency terminal dashboard that shows every `claude` CLI session
running on your machine — live, refreshing like `top`/`htop`. See at a glance
which projects have agents working, what model they're on, which git branch
they're on, and what each one is doing *right now* (running a tool, thinking,
or waiting for you).

```
atop — Claude agents  3 agents running                              17:53:44  ↻2s
CPU 16.5%   MEM 1.5G   sort:cpu↓                                    host macbook

    PID MODEL        PROJECT              BRANCH       STATE       %CPU    MEM     UP   IDLE ACTIVITY
  92695 opus-4-8     atop                 main         ● working    8.7   540M     6m     2s ⚙ Bash
  66514 sonnet-4-6   timebook             main         ● thinking   7.8   571M    22m     4s ▸ thinking…
  62563 opus-4-8     marketingops         main         ○ idle       0.1   431M    28m    23m awaiting input
```

## Usage

No install needed — run it with `npx`:

```sh
npx atop
```

Or install globally:

```sh
npm install -g atop
atop
```

### Live keys

| Key | Action |
|-----|--------|
| `q` / `Esc` / `Ctrl-C` | Quit |
| `s` | Cycle the sort column |
| `r` | Reverse the sort order |
| `+` / `-` | Increase / decrease the refresh interval |

### Options

```
-d, --interval <sec>   Refresh interval in seconds (default: 2)
-s, --sort <key>       Sort by: cpu, mem, up, idle, project, pid (default: cpu)
-r, --reverse          Reverse sort order
-n, --once             Print a single snapshot and exit (no live UI)
    --json             Print agents as JSON and exit
    --no-color         Disable ANSI colors
-h, --help             Show help
-v, --version          Show version
```

`--once` and `--json` make `atop` scriptable:

```sh
atop --json | jq '.[] | select(.state == "working") | .project'
watch -n5 'atop --once'
```

## Columns

| Column | Meaning |
|--------|---------|
| **PID** | OS process id of the `claude` CLI session |
| **MODEL** | Model the session is using (e.g. `opus-4-8`) |
| **PROJECT** | Working directory basename of the agent |
| **BRANCH** | Git branch the session is on |
| **STATE** | `working` (running a tool) · `thinking` · `replied` · `waiting` · `idle` · `stalled` |
| **%CPU** | Process CPU usage |
| **MEM** | Resident memory |
| **UP** | How long the process has been running |
| **IDLE** | Time since the last transcript activity |
| **ACTIVITY** | What the agent is doing right now (current tool, prompt, …) |

## How it works

`atop` reads only local state — nothing is sent anywhere:

1. It lists running **`claude` CLI processes** with `ps` (the desktop app and
   its helpers are filtered out), and resolves each one's working directory
   via `/proc` on Linux or `lsof` on macOS.
2. It joins each process to its **session transcript** under
   `~/.claude/projects/<encoded-cwd>/<session>.jsonl`, matching on the working
   directory.
3. It reads just the **tail** of each matching transcript to extract the model,
   git branch, version, last-activity time, and current tool call — then renders
   it all as a `top`-style table.

## Requirements

- Node.js ≥ 16
- macOS or Linux (`ps`, plus `lsof` on macOS)

## License

MIT © Tamas Kalman
