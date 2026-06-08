# Changelog

All notable changes to **agentop** are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project follows
[Semantic Versioning](https://semver.org/).

## [0.5.7] — 2026-06-08

### Changed

- **PROJECT and BRANCH columns now grow to fit their content on wide terminals**
  instead of staying fixed at 20/12 and truncating with an ellipsis. They expand
  toward their widest cell (capped at 40/32 so one long value can't dominate the
  row); ACTIVITY absorbs the remainder but keeps its minimum width, and a narrow
  terminal collapses back to the previous fixed layout. Subagent slugs (shown in
  the PROJECT column) are included in the measurement (#11).

## [0.5.6] — 2026-06-08

### Added

- **Live Task subagents as `SUB` rows** — Claude Code Task-tool subagents run
  inside a single `claude` process, so a process monitor only ever shows the
  parent. agentop now reads each live session's `subagents/agent-*.jsonl`
  transcripts (mtime-gated to a 120s window, so finished subagents age out) and
  renders each active subagent as a flat, dimmed `SUB` row beneath its parent,
  showing its slug and model. The header count and CPU/MEM totals still reflect
  only real processes, appending `· N subagents`. The slug is sanitized like the
  other transcript-derived fields before render (#4).

### Fixed

- **pi:** a bare `pi <digits>` invocation (the GNU arbitrary-precision
  calculator) is no longer matched as the Pi coding agent. The numeric-only
  disambiguation now applies only to flag-free command lines, so genuine
  `pi --session …` / `--fork` / `-r` sessions still match (#5, #8).
- **install.sh:** the checksum check no longer redirects stderr to `/dev/null`,
  so a hash mismatch or missing-file error is now visible instead of only the
  generic "verification FAILED" message (#7, #10).

### Changed

- Restored the WAL-mode / stderr rationale comment in the shared `src/sqlite.ts`
  read path, documenting why `-readonly` is omitted (it fails with
  `SQLITE_CANTOPEN` on WAL-mode DBs) and why stderr is discarded (#6, #9).
- Dev tooling: excluded `.claude` worktrees from `deno fmt`/`lint`/`check`
  traversal, and made `.husky/pre-commit` executable so the format/lint/test
  gate runs on commit.

## [0.5.5] — 2026-06-08

### Added

- **Three new providers** — **Pi** (Earendil), **Hermes Agent**, and **OpenCode**,
  bringing the dashboard to 8 coding-agent frameworks. Each reads only local
  session state and degrades gracefully (`no-session`) when none is found. Hermes
  enriches only the unambiguous single-process case, since its `sessions` table
  has no working-directory column to correlate on.
- **Shared provider infrastructure** — capability metadata
  (`src/provider-capabilities.ts`), terminal-text sanitization + env/shim helpers
  (`src/provider-utils.ts`), and a read-only `sqlite3` helper (`src/sqlite.ts`)
  that all SQLite-backed providers (Codex, Hermes, OpenCode) route through.
- **Standalone compiled binaries** — `deno compile` builds dependency-free
  executables for Linux and macOS (x86_64 + arm64), attached to each GitHub
  Release by a new `build-binaries.yml` workflow (additive — it never blocks the
  npm/JSR publish).
- **One-line installer** — `curl -fsSL …/install.sh | sh` detects OS/arch,
  downloads the matching binary from the latest release, verifies its SHA-256
  checksum, and installs it to your `PATH`.

## [0.5.4] — 2026-06-08

### Added

- **Bun support** — the same TypeScript source now runs on Bun ≥ 1 (via the Node
  code path; `globalThis.Deno` is undefined under Bun, so `src/platform.ts` uses
  the `node:child_process`/`node:fs`/`process` seam). Documented `bunx agentop`
  and added a Bun smoke job to CI. No logic changes.

## [0.5.3] — 2026-06-08

### Fixed

- JSR: read the version via a JSON import of deno.json so `main.ts` works when
  run remotely (`deno run jsr:@ktamas77/agentop`); the previous fs read failed
  over https.

## [0.5.2] — 2026-06-08

### Fixed

- JSR publish: pass `--allow-dirty` so the generated `deno.lock` no longer
  aborts the OIDC publish. First automated JSR release.

## [0.5.1] — 2026-06-08

### Added

- **Published to JSR** as `@ktamas77/agentop` — `deno run -A jsr:@ktamas77/agentop`.
  Releases now publish to both npm and JSR (JSR via OIDC, no token).

### Fixed

- CI/publish: run `deno install` before `deno check`/`test`/`publish` so
  `@types/node` resolves on a fresh checkout. Scope the JSR package to the
  runtime source + docs.

## [0.5.0] — 2026-06-08

### Changed

- **Rewritten in TypeScript** and converted to ESM. The same typed source now
  runs on **Node.js ≥ 18 and Deno ≥ 2**; a small `src/platform.ts` abstracts the
  two runtime-specific seams (subprocess + terminal).
- Dev toolchain moved to Deno (`deno fmt`/`lint`/`check`/`test`); `tsc` builds the
  npm `dist/` (now ships compiled `.js` + `.d.ts`). Dropped ESLint/Prettier.

## [0.4.0] — 2026-06-08

### Added

- **Google Gemini** provider — detects `node …/gemini` (and dedupes the launcher
  shim vs. the worker), reading chats from
  `~/.gemini/tmp/<project>/chats/session-*.jsonl`.
- **Google Antigravity** (`agy`) provider — reads the human-readable transcript
  under `~/.gemini/antigravity-cli/brain/<id>/…/transcript.jsonl`, matched to the
  process by the workspace it references; model parsed from the session's
  settings line.
- `ps` now captures `ppid`, used to filter out launcher shims.
- AGENT colors for `gemini` (blue) and `agy` (magenta); wider MODEL column for
  Gemini-style ids; `shortModel` strips `-preview`/`-exp`/`-latest`.

## [0.3.0] — 2026-06-08

### Added

- **xAI Grok** provider — detects `grok`, reads `~/.grok/sessions/…`
  (`summary.json` + `events.jsonl`).
- AGENT column color for `grok` (yellow).

## [0.2.2] — 2026-06-08

### Fixed

- Codex: dropped `sqlite3 -readonly` (failed with `SQLITE_CANTOPEN` on the
  WAL-mode DB) and silenced subprocess stderr so a failed query can no longer
  leak into the TUI. Resolve the Codex model from `~/.codex/config.toml` when a
  live session has no persisted thread row yet.

## [0.2.1] — 2026-06-08

### Changed

- Package description/keywords updated to mention Codex.

## [0.2.0] — 2026-06-08

### Added

- **OpenAI Codex** provider — reads the `threads` table in
  `~/.codex/state_*.sqlite` via the system `sqlite3` binary (still zero npm
  deps), with activity from the thread's rollout file.
- Refactored into a **provider abstraction** (`lib/providers/*`); new **AGENT**
  column.

## [0.1.2] — 2026-06-07

### Added

- `--demo` mode (fabricated sample agents) and a recorded demo GIF.

## [0.1.1] — 2026-06-07

### Changed

- Releases now publish to npm via OIDC **Trusted Publishing** (no token,
  provenance-signed).

## [0.1.0] — 2026-06-07

### Added

- Initial release — a `top`-style live terminal dashboard for running Claude
  Code CLI agents. Zero runtime dependencies; macOS/Linux.

[0.5.7]: https://github.com/ktamas77/agentop/releases/tag/v0.5.7
[0.5.6]: https://github.com/ktamas77/agentop/releases/tag/v0.5.6
[0.5.5]: https://github.com/ktamas77/agentop/releases/tag/v0.5.5
[0.5.4]: https://github.com/ktamas77/agentop/releases/tag/v0.5.4
[0.5.3]: https://github.com/ktamas77/agentop/releases/tag/v0.5.3
[0.5.2]: https://github.com/ktamas77/agentop/releases/tag/v0.5.2
[0.5.1]: https://github.com/ktamas77/agentop/releases/tag/v0.5.1
[0.5.0]: https://github.com/ktamas77/agentop/releases/tag/v0.5.0
[0.4.0]: https://github.com/ktamas77/agentop/releases/tag/v0.4.0
[0.3.0]: https://github.com/ktamas77/agentop/releases/tag/v0.3.0
[0.2.2]: https://github.com/ktamas77/agentop/releases/tag/v0.2.2
[0.2.1]: https://github.com/ktamas77/agentop/releases/tag/v0.2.1
[0.2.0]: https://github.com/ktamas77/agentop/releases/tag/v0.2.0
[0.1.2]: https://github.com/ktamas77/agentop/releases/tag/v0.1.2
[0.1.1]: https://github.com/ktamas77/agentop/releases/tag/v0.1.1
[0.1.0]: https://github.com/ktamas77/agentop/releases/tag/v0.1.0
