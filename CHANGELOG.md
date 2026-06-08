# Changelog

All notable changes to **agentop** are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project follows
[Semantic Versioning](https://semver.org/).

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
