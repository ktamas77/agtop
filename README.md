# agentop

[![npm version](https://img.shields.io/npm/v/agentop.svg)](https://www.npmjs.com/package/agentop)
[![CI](https://github.com/ktamas77/agentop/actions/workflows/ci.yml/badge.svg)](https://github.com/ktamas77/agentop/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> `top`, but for your running **coding agents** — Claude Code, Codex, Grok, Gemini, and Antigravity.

A zero-dependency terminal dashboard that shows every `claude` (Claude Code),
`codex` (OpenAI Codex), `grok` (xAI Grok), `gemini` (Google Gemini), and `agy`
(Google Antigravity) CLI session running on your machine — live, refreshing like
`top`/`htop`. See at a glance which projects have agents working, what framework
and model they're on, which git branch they're on, and what each one is doing
*right now* (running a tool, thinking, or waiting for you).

![agentop in action](https://raw.githubusercontent.com/ktamas77/agentop/main/docs/demo.gif)

## Usage

No install needed — run it with `npx`:

```sh
npx agentop
```

Or install globally with npm:

```sh
npm install -g agentop
agentop
```

…or with Homebrew (macOS/Linux):

```sh
brew install ktamas77/tap/agentop
```

…or with Deno (it's published to [JSR](https://jsr.io/@ktamas77/agentop) and runs
TypeScript natively):

```sh
deno run -A jsr:@ktamas77/agentop          # run it
deno install -gA -n agentop jsr:@ktamas77/agentop   # install the command
```

…or as a **standalone binary** — no Node, no Deno, no runtime to install. One line
downloads the right build for your machine from the latest GitHub release, verifies
its checksum, and drops it on your `PATH`:

```sh
curl -fsSL https://raw.githubusercontent.com/ktamas77/agentop/main/install.sh | sh
```

Supports Linux and macOS on both x86_64 and arm64. The installer picks the matching
build via `uname`, verifies a SHA-256 checksum before installing, and installs to
`/usr/local/bin` (or `~/.local/bin` if that isn't writable — override with
`AGENTOP_INSTALL_DIR`). Pin a version with `AGENTOP_VERSION=vX.Y.Z`. Prefer a package
manager? The npm, Homebrew, and Deno options above are all equivalent — the binary is
just the dependency-free option.

> **macOS note.** The binaries are not yet code-signed, so a manually downloaded build
> may be quarantined by Gatekeeper ("cannot be opened"). The `install.sh` one-liner
> clears this for you automatically; if you download a binary by hand, run
> `xattr -d com.apple.quarantine ./agentop` once. Each binary is ~137 MB — it embeds the
> Deno runtime, which is what makes it dependency-free.

…or with [Bun](https://bun.sh) (runs the npm package directly):

```sh
bunx agentop
```

Want to see it without any agents running? Try the demo:

```sh
npx agentop --demo
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
    --demo             Show fabricated sample agents (no real data)
    --no-color         Disable ANSI colors
-h, --help             Show help
-v, --version          Show version
```

`--once` and `--json` make `agentop` scriptable:

```sh
agentop --json | jq '.[] | select(.state == "working") | .project'
watch -n5 'agentop --once'
```

## Columns

| Column | Meaning |
|--------|---------|
| **PID** | OS process id of the agent's CLI session |
| **AGENT** | Which framework — `claude`, `codex`, `grok`, `gemini`, or `agy` |
| **MODEL** | Model the session is using (e.g. `opus-4-8`, `gpt-5.5`, `grok-4`, `gemini-3-flash`) |
| **PROJECT** | Working directory basename of the agent |
| **BRANCH** | Git branch the session is on |
| **STATE** | `working` (running a tool) · `thinking` · `replied` · `waiting` · `idle` · `stalled` |
| **%CPU** | Process CPU usage |
| **MEM** | Resident memory |
| **UP** | How long the process has been running |
| **IDLE** | Time since the last transcript activity |
| **ACTIVITY** | What the agent is doing right now (current tool, prompt, …) |

## How it works

`agentop` reads only local state — nothing is sent anywhere:

1. It lists running **`claude`, `codex`, `grok`, `gemini`, and `agy` CLI
   processes** with `ps` (desktop apps, helpers, and launcher shims are filtered
   out), and resolves each one's working directory via `/proc` on Linux or
   `lsof` on macOS.
2. It joins each process to its **session** by working directory:
   - **Claude Code** → the transcript under
     `~/.claude/projects/<encoded-cwd>/<session>.jsonl` (reads just the tail).
   - **Codex** → the `threads` table in `~/.codex/state_*.sqlite` (read via the
     system `sqlite3` binary — still zero npm deps), with activity from the
     thread's rollout file when present.
   - **Grok** → `~/.grok/sessions/<encoded-cwd>/<id>/` (`summary.json` for the
     model, `events.jsonl` for the current phase).
   - **Gemini** → `~/.gemini/tmp/<project>/chats/session-*.jsonl`.
   - **Antigravity** → the readable transcript in
     `~/.gemini/antigravity-cli/brain/<id>/…/transcript.jsonl`, matched to the
     workspace it references.
3. From each it extracts the model, git branch, version, last-activity time, and
   the current tool call, and renders it all as a `top`-style table.

The design is a small **provider** abstraction (`src/providers/*`), so adding
another agent framework is mostly one new file.

## Requirements

- Runs on **Node.js ≥ 18**, **Deno ≥ 2**, or **Bun ≥ 1** — the same TypeScript
  source runs on all three (a tiny `src/platform.ts` abstracts the runtime; Bun
  uses the Node path).
- macOS or Linux (`ps`, plus `lsof` on macOS)
- `sqlite3` (a standard system binary) is used for Codex live enrichment; if it's
  missing, Codex agents still show — just without live model/activity.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Development

The project is **TypeScript**, ESM. Deno is the dev toolchain (it runs `.ts`
natively); `tsc` builds the npm `dist/`.

```sh
deno task start          # run from source
deno task demo           # run the demo
deno test -A             # full test suite
deno fmt && deno lint    # format + lint
deno check main.ts       # type-check
npm run build            # tsc -> dist/ (the npm artifact)
npm run check            # fmt + lint + check + test + build (what CI runs)
deno task compile        # standalone binary -> dist-bin/agentop (host)
deno task compile aarch64-apple-darwin   # cross-compile a specific target
```

Cutting a release (tagging, the binary build, and publishing to npm + JSR) is
documented in [RELEASING.md](RELEASING.md).

`src/*.ts` is the shared, typed core (one `src/providers/<name>.ts` per agent
framework). Entry points: `bin/agentop.js` (npm, over the built `dist/`) and
`main.ts` (Deno). A Husky **pre-commit** hook runs the same `deno fmt/lint/check/
test` + `tsc` build; CI runs a Deno matrix and a Node build/smoke matrix across
macOS/Linux.

## License

MIT © Tamas Kalman
