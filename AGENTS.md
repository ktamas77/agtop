<!-- GSD:project-start source:PROJECT.md -->
## Project

**Agentop**

Agentop is a zero-dependency terminal dashboard for local coding-agent CLI sessions. It currently watches running Claude Code, Codex, Grok, Gemini, and Antigravity sessions by reading local process and session state, then renders a live `top`-style view with model, project, branch, state, idle time, and activity.

This project expands Agentop's provider support to include Hermes, Pi, OpenCode, and possibly GSD-Pi. The expansion should preserve the existing local-only architecture and make each supported agent visible with full dashboard parity wherever the provider's local state exposes enough information.

**Core Value:** Users can see every relevant local coding-agent session in one reliable terminal dashboard without installing runtime dependencies or sending local agent data anywhere.

### Constraints

- **Runtime dependencies**: Keep zero runtime npm dependencies - this is part of the package identity and README promise.
- **Data boundary**: Read only local process/session state - no remote APIs, telemetry, or provider network calls.
- **Provider parity**: Done means process, cwd, model, session, state, idle time, and activity when local state allows it - detect-only is insufficient for providers whose schemas are discoverable.
- **Pi/GSD-Pi boundary**: Probe Pi first and split GSD-Pi only for GSD-specific state base Pi cannot expose - avoid duplicate providers without evidence.
- **Compatibility**: Preserve macOS and Linux behavior - process discovery depends on `ps`, Linux `/proc`, and macOS `lsof`.
- **Testing**: Lock provider behavior with fixtures before or alongside parser changes - upstream schema drift is a known fragile area.
- **User output**: Keep rendered rows within terminal width and keep JSON output shape compatible unless a documented provider field change is necessary.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- JavaScript (CommonJS, ECMAScript 2022) - All runtime source lives in `bin/agentop.js`, `lib/**/*.js`, and `test/**/*.js`.
- TypeScript type checking - `tsconfig.json` enables `allowJs` and `checkJs` for JavaScript source without emitting build output.
- YAML - GitHub Actions workflows in `.github/workflows/ci.yml` and `.github/workflows/publish.yml`.
## Runtime
- Node.js `>=16` - Runtime requirement declared in `package.json`.
- Node.js `>=18` - Development test requirement for the built-in `node:test` runner, documented in `README.md`.
- Terminal/TTY runtime - Live dashboard paths use `process.stdin`, `process.stdout`, raw mode, terminal dimensions, and ANSI escape sequences in `bin/agentop.js`, `lib/ui.js`, `lib/render.js`, and `lib/colors.js`.
- macOS and Linux only - Supported platforms are declared in `package.json`; process discovery uses `ps`, Linux `/proc`, and macOS `lsof` in `lib/processes.js`.
- npm - Scripts and lockfile are npm-based in `package.json` and `package-lock.json`.
- Lockfile: `package-lock.json` present, lockfile version 3.
## Frameworks
- None - Runtime is a zero-dependency Node.js CLI using Node built-ins and local modules.
- CommonJS module system - `package.json` sets `"type": "commonjs"` and source files use `require()` / `module.exports`.
- Node built-in test runner - `npm test` runs `node --test` from `package.json`.
- Node built-in assertions - Tests import `node:assert/strict` in files such as `test/cli.test.js`, `test/providers.test.js`, and `test/state.test.js`.
- TypeScript `^5.6.3` (resolved `5.9.3`) - `npm run typecheck` runs `tsc --noEmit` against JS via `tsconfig.json`.
- ESLint `^9.13.0` (resolved `9.39.4`) - Flat config in `eslint.config.js`; `npm run lint` runs `eslint .`.
- Prettier `^3.3.3` (resolved `3.8.3`) - `npm run format` and `npm run format:check` in `package.json`.
- Husky `^9.1.6` and lint-staged `^15.2.10` - Pre-commit formatting/linting configured through `package.json`.
## Key Dependencies
- Node.js built-ins - `fs`, `path`, `os`, `child_process`, and process/TTY APIs are the runtime foundation across `lib/processes.js`, `lib/state.js`, `lib/jsonl.js`, `lib/ui.js`, and provider modules under `lib/providers/`.
- Local provider modules - Agent-specific collectors live in `lib/providers/claude.js`, `lib/providers/codex.js`, `lib/providers/grok.js`, `lib/providers/gemini.js`, and `lib/providers/agy.js`.
- Local JSONL helpers - Transcript parsing is centralized in `lib/jsonl.js`.
- Local process helpers - Process listing and cwd resolution are centralized in `lib/processes.js`.
- Local rendering helpers - TUI frame rendering and formatting are in `lib/render.js`, `lib/format.js`, and `lib/colors.js`.
- `ps` system binary - Required for process discovery in `lib/processes.js`.
- Linux `/proc/<pid>/cwd` - Preferred cwd resolver on Linux in `lib/processes.js`.
- `lsof` system binary - macOS/BSD cwd resolver in `lib/processes.js`.
- `sqlite3` system binary - Optional Codex live enrichment reader in `lib/providers/codex.js`.
## Configuration
- No required application `.env` file detected.
- Optional `NO_COLOR` disables ANSI styling in `lib/colors.js`.
- Runtime configuration is primarily CLI flags parsed in `bin/agentop.js`: `--interval`, `--sort`, `--reverse`, `--once`, `--json`, `--demo`, and `--no-color`.
- `package.json` - npm scripts, CLI bin mapping, package metadata, Node engine, OS support, lint-staged config, and dev dependency ranges.
- `package-lock.json` - npm dependency resolution.
- `tsconfig.json` - JavaScript type checking with CommonJS/ES2022 options.
- `eslint.config.js` - ESLint flat config with Node globals and Prettier compatibility.
- `.github/workflows/ci.yml` - Format, lint, typecheck, and test CI jobs.
- `.github/workflows/publish.yml` - npm package publish workflow.
## Platform Requirements
- macOS or Linux.
- Node.js 18+ for the full test suite.
- npm for dependency installation and scripts.
- `ps` available on the host.
- `lsof` available on macOS for cwd enrichment.
- `sqlite3` available for full Codex session enrichment; Codex rows still render without it.
- Distributed as an npm CLI package named `agentop` via `package.json`.
- CLI entry point is `bin/agentop.js`.
- Published package includes `bin/`, `lib/`, `README.md`, and `LICENSE` from `package.json`.
- Runtime target is the user's local macOS/Linux machine, not a hosted server.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Use lower-case file names in implementation directories, with short noun/module names such as `lib/collect.js`, `lib/render.js`, `lib/state.js`, and `lib/processes.js`.
- Put provider-specific modules under `lib/providers/` using the provider command name, for example `lib/providers/claude.js`, `lib/providers/codex.js`, `lib/providers/grok.js`, `lib/providers/gemini.js`, and `lib/providers/agy.js`.
- Keep the executable entry point in `bin/agentop.js`; implementation modules live under `lib/`.
- Test files use `*.test.js` names under `test/`, for example `test/render.test.js`, `test/providers.test.js`, and `test/cli.test.js`.
- Use `camelCase` for functions, including exported API functions such as `collectAgents` in `lib/collect.js`, `buildFrame` in `lib/render.js`, `readTailObjects` in `lib/jsonl.js`, and `listAllProcesses` in `lib/processes.js`.
- Use short, action-oriented internal helpers such as `parseArgs`, `printHelp`, and `fail` in `bin/agentop.js`, or `deriveActivity`, `summarizeTail`, and `configModel` in `lib/providers/codex.js`.
- Use provider modules with a common function surface: `matchProcess`, `collect`, and provider-specific summarizers in files such as `lib/providers/claude.js` and `lib/providers/grok.js`.
- Use `camelCase` for local variables and object properties, for example `idleSec`, `rawState`, `gitBranch`, `rssKb`, and `uptimeSec` across `lib/collect.js`, `lib/render.js`, and `test/collect.test.js`.
- Use `UPPER_SNAKE_CASE` for module-level constants that represent static data or terminal control sequences, such as `PROVIDERS` in `lib/collect.js`, `SORTS` and `COLUMNS` in `lib/render.js`, `ALT_ON` in `lib/ui.js`, and `MAX_SESSION_SCAN` in `lib/providers/claude.js`.
- Use concise temporary names in tight parsing loops when the meaning is local, for example `p`, `t`, `s`, `m`, and `out` in `lib/providers/codex.js`, `lib/processes.js`, and `test/render.test.js`.
- This is a checked JavaScript CommonJS codebase, not a TypeScript source tree; `tsconfig.json` enables `allowJs` and `checkJs` for `bin/**/*.js`, `lib/**/*.js`, and `test/**/*.js`.
- Do not introduce TypeScript-only type declarations in implementation files unless the repository first moves away from JavaScript sources.
- Use lightweight JSDoc only where it clarifies otherwise dynamic boundaries; the existing code relies mostly on clear object shapes in files such as `lib/demo.js`, `lib/render.js`, and `test/collect.test.js`.
## Code Style
- Use Prettier with `.prettierrc.json`.
- Keep `printWidth` at 100, `singleQuote` enabled, `trailingComma` set to `all`, semicolons required, `tabWidth` at 2, and `endOfLine` set to `lf` as configured in `.prettierrc.json`.
- Keep Markdown, `docs/`, `node_modules/`, and `package-lock.json` out of Prettier formatting according to `.prettierignore`.
- Every JavaScript file starts with `'use strict';`, including `bin/agentop.js`, `lib/render.js`, `lib/providers/codex.js`, and `test/format.test.js`.
- Use ESLint flat config from `eslint.config.js` with `@eslint/js` recommended rules, Node globals from `globals`, and `eslint-config-prettier`.
- Run `npm run lint` for checks and `npm run lint:fix` for automatic fixes from `package.json`.
- Prefer `const` over `let` where values are not reassigned; `prefer-const` is an error in `eslint.config.js`.
- Keep `console` allowed by ESLint but use process streams in CLI code; `bin/agentop.js` uses `process.stdout.write` and `process.stderr.write` instead of `console.log`.
- Keep `eqeqeq` with smart mode from `eslint.config.js`; use strict equality in new code unless `== null` style checks are deliberately needed.
- Unused variables are warnings, with underscore-prefixed args ignored and caught errors ignored by config in `eslint.config.js`.
## Import Organization
- No path aliases are configured in `tsconfig.json`; use relative CommonJS imports such as `require('./format')`, `require('../lib/render')`, and `require('../jsonl')`.
- Keep package-relative entry-point imports out of implementation modules; tests import implementation through relative paths such as `require('../lib/providers/codex')`.
## Error Handling
- Treat OS, file-system, process, and transcript reads as best-effort boundaries. Return empty arrays, `null`, or default records on expected environmental failure, as in `lib/processes.js`, `lib/jsonl.js`, `lib/state.js`, and `lib/providers/claude.js`.
- Use `try`/`catch` around all external reads and subprocess calls; keep caught errors local when the dashboard can still render useful output, as in `lib/providers/grok.js` and `lib/providers/gemini.js`.
- Use CLI validation failures for user input in `bin/agentop.js` through `fail(msg)`, writing to stderr and exiting with status `2`.
- Avoid throwing from provider parsing paths. Provider summarizers such as `summarizeTail` in `lib/providers/codex.js` and `summarizeEvents` in `lib/providers/grok.js` return `rawState: 'unknown'` on empty or unrecognized input.
- Include bounded resource settings for subprocesses and large reads. `lib/processes.js`, `lib/providers/codex.js`, and `test/cli.test.js` use `maxBuffer`, `timeout`, or both.
## Logging
- Do not add a logging framework; no runtime dependency is present in `package.json`.
- Use `process.stdout.write` and `process.stderr.write` for CLI output in `bin/agentop.js`.
- Use TUI rendering through `lib/ui.js` and `lib/render.js`; render text through `buildFrame` rather than logging from data-collection modules.
- Keep low-level modules quiet. Files such as `lib/jsonl.js`, `lib/processes.js`, and `lib/providers/codex.js` swallow expected read/process errors so failures do not leak into the TUI.
## Comments
- Use comments to explain why an implementation chooses a boundary or workaround, for example the WAL-mode SQLite note in `lib/providers/codex.js`, the launcher-shim filtering in `lib/collect.js`, and the `/proc` versus `lsof` explanation in `lib/processes.js`.
- Use section comments for long render or provider parsing functions when they make the flow scannable, as in `lib/render.js` and `test/providers.test.js`.
- Avoid comments that restate simple code; short helpers in `lib/state.js` and `lib/format.js` are mostly self-describing.
- No `TODO`, `FIXME`, `HACK`, or `XXX` markers are present under `lib/`, `bin/`, or `test/`; add tracked issue references if future TODOs are introduced.
- JSDoc is not a dominant convention. The main observed JSDoc use is the inline `@type {any}` annotation in `test/cli.test.js` for subprocess error assertions.
- Prefer clear function names and explicit test assertions over broad JSDoc blocks for internal functions.
## Function Design
## Module Design
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Single executable CLI entry point in `bin/agentop.js`
- Synchronous local process, filesystem, and optional system-command inspection
- Provider modules normalize different agent CLI session stores into one agent record shape
- Rendering and live terminal control are separated from collection and enrichment
- No npm runtime dependencies; Node.js built-ins and host tools (`ps`, `lsof`, `sqlite3`) provide integration points
- Tests use Node's built-in runner under `test/*.test.js`
## Layers
- Purpose: Parse command-line options, select one-shot, JSON, demo, or live behavior, and write process output.
- Contains: Argument parsing, help/version text, top-level mode selection.
- Location: `bin/agentop.js`
- Depends on: `lib/collect.js`, `lib/demo.js`, `lib/render.js`, `lib/ui.js`, `lib/colors.js`, `package.json`
- Used by: The npm binary mapping in `package.json` (`agentop` -> `bin/agentop.js`)
- Purpose: Build a normalized list of running coding-agent sessions across all supported providers.
- Contains: Provider registration, process-to-provider matching, launcher-shim filtering, cwd resolution, state classification.
- Location: `lib/collect.js`
- Depends on: `lib/processes.js`, `lib/state.js`, `lib/providers/claude.js`, `lib/providers/codex.js`, `lib/providers/grok.js`, `lib/providers/gemini.js`, `lib/providers/agy.js`
- Used by: `bin/agentop.js`, `lib/ui.js`, `test/collect.test.js`
- Purpose: Read OS process data once and attach working directories to candidate agent processes.
- Contains: `ps` parsing, Linux `/proc/<pid>/cwd` reads, macOS `lsof` fallback, executable basename parsing.
- Location: `lib/processes.js`
- Depends on: Node built-ins (`child_process`, `fs`) and formatting helper `lib/format.js`
- Used by: `lib/collect.js` and provider matchers through `exeBase`
- Purpose: Detect a supported agent CLI process and enrich it from that provider's local session store.
- Contains: One provider module per agent framework, each exporting `name`, `matchProcess(args)`, and `collect(procs)`.
- Location: `lib/providers/*.js`
- Depends on: `lib/jsonl.js`, `lib/state.js`, `lib/processes.js`, Node filesystem/path/os APIs, and provider-specific local stores under the user's home directory.
- Used by: `lib/collect.js`
- Purpose: Convert provider raw activity into shared dashboard state and format terminal-safe values.
- Contains: State classifier, first-line extraction, git branch reads, duration/memory/model formatting, ANSI-aware fitting, ANSI color helpers.
- Location: `lib/state.js`, `lib/format.js`, `lib/colors.js`
- Depends on: Node built-ins and local helper modules only.
- Used by: Providers, `lib/collect.js`, `lib/render.js`, and tests.
- Purpose: Turn normalized agent records into a fixed-width terminal frame.
- Contains: Sort keys, column definitions, row rendering, state styles, header/footer rendering, width truncation.
- Location: `lib/render.js`
- Depends on: `lib/colors.js`, `lib/format.js`, Node `os`
- Used by: `bin/agentop.js`, `lib/ui.js`, `test/render.test.js`
- Purpose: Manage alternate-screen terminal lifecycle, refresh loop, keyboard controls, and resize redraws.
- Contains: Raw-mode input handling, cleanup hooks, interval/sort/reverse in-memory UI state.
- Location: `lib/ui.js`
- Depends on: `lib/collect.js`, `lib/demo.js`, `lib/render.js`
- Used by: `bin/agentop.js`
- Purpose: Read bounded JSONL heads/tails without loading entire transcript files.
- Contains: `parseLines`, `readTailObjects`, `readHeadObjects`
- Location: `lib/jsonl.js`
- Depends on: Node `fs`
- Used by: All providers that read transcript or event JSONL files.
- Purpose: Provide deterministic, privacy-safe fake agent records for screenshots, GIFs, demos, and tests.
- Contains: Fixture agents, rotating state cycle, deterministic `demoAgents(nowMs)`.
- Location: `lib/demo.js`
- Depends on: No local modules.
- Used by: `bin/agentop.js`, `lib/ui.js`, `test/demo.test.js`
- Purpose: Lock CLI behavior, process parsing, provider summarization, renderer width behavior, demo fixtures, and formatting helpers.
- Contains: Node test runner tests in `test/*.test.js`.
- Location: `test/`
- Depends on: Node built-ins (`node:test`, `node:assert/strict`, `node:child_process`, `node:fs`, `node:os`, `node:path`) and public module exports.
- Used by: `npm test`, `npm run check`, `.github/workflows/ci.yml`, `.husky/pre-commit`
## Data Flow
- Application state is process-local and ephemeral.
- Live UI state is limited to `interval`, `sort`, and `reverse` inside `lib/ui.js`.
- Persistent agent state belongs to external tools and is read from local stores such as `~/.claude/projects`, `~/.codex/state_*.sqlite`, `~/.grok/sessions`, `~/.gemini/tmp`, and `~/.gemini/antigravity-cli/brain`.
- No application database, cache file, or background daemon is maintained by this repo.
## Key Abstractions
- Purpose: Encapsulate process matching and session enrichment for one agent framework.
- Examples: `lib/providers/claude.js`, `lib/providers/codex.js`, `lib/providers/grok.js`, `lib/providers/gemini.js`, `lib/providers/agy.js`
- Pattern: CommonJS module contract with `name`, `matchProcess(args)`, and `collect(procs)`.
- Rule: Add provider-specific transcript parsing inside the provider module, but keep the returned record shape compatible with `lib/collect.js` and `lib/render.js`.
- Purpose: Shared normalized data model consumed by sorting, rendering, JSON output, and tests.
- Examples: Records created by `lib/providers/codex.js` and post-processed in `lib/collect.js`.
- Pattern: Plain object with process metrics, project metadata, provider metadata, activity fields, `idleSec`, and final display `state`.
- Rule: Add new displayed fields only after updating `lib/render.js`, `test/render.test.js`, and any affected CLI JSON expectations.
- Purpose: Convert provider-native transcript/event formats into `rawState` and `detail`.
- Examples: `deriveActivity` in `lib/providers/claude.js`, `deriveActivity` in `lib/providers/codex.js`, `summarizeEvents` in `lib/providers/grok.js`, `deriveActivity` in `lib/providers/gemini.js`, `summarizeSteps` in `lib/providers/agy.js`
- Pattern: Provider-local parser plus shared state classifier in `lib/state.js`.
- Rule: Keep provider parsing tolerant of missing, malformed, or inaccessible files.
- Purpose: Read recent transcript data without loading whole session files.
- Examples: `readTailObjects` and `readHeadObjects` in `lib/jsonl.js`
- Pattern: Byte-window read, partial-line trimming, best-effort JSON parsing.
- Rule: Use this helper for JSONL transcript reads instead of reading full files.
- Purpose: Convert agent records into a terminal-size table.
- Examples: `buildFrame`, `renderRow`, and `sortAgents` in `lib/render.js`
- Pattern: Fixed column definitions plus one flex activity column, ANSI-aware width management.
- Rule: Keep every rendered line within terminal width; `test/render.test.js` contains the regression guard.
- Purpose: Determine whether the app runs live, one-shot text, JSON, or demo data.
- Examples: Option parsing and mode branching in `bin/agentop.js`.
- Pattern: Manual argument parser with fail-fast validation.
- Rule: Add new flags in `parseArgs`, document them in `printHelp`, README usage, and CLI tests.
## Entry Points
- Location: `bin/agentop.js`
- Triggers: User runs `agentop`, `npx agentop`, or `node bin/agentop.js`.
- Responsibilities: Parse CLI flags, select data source, produce JSON/text/live output, handle help/version/failure exits.
- Location: `lib/ui.js`
- Triggers: `bin/agentop.js` calls `runLive(opts)` when stdout is a TTY and one-shot modes are not requested.
- Responsibilities: Draw frames repeatedly, react to `q`, `Esc`, `Ctrl-C`, `s`, `r`, `+`, `-`, restore terminal state.
- Location: `lib/collect.js`
- Triggers: CLI one-shot/JSON modes and live UI draw calls.
- Responsibilities: Discover processes, assign providers, enrich sessions, normalize state.
- Location: `lib/providers/*.js`
- Triggers: `lib/collect.js` provider loop.
- Responsibilities: Claim process args, read provider-specific local session data, return normalized records.
- Location: `test/*.test.js`
- Triggers: `npm test`, `npm run check`, `.github/workflows/ci.yml`, `.husky/pre-commit`.
- Responsibilities: Verify public helpers, CLI behavior, provider parsing, process discovery, rendering, and demo data.
## Error Handling
- `bin/agentop.js` calls `fail(msg)` for unknown flags, invalid sort keys, and invalid intervals; this writes stderr and exits with code `2`.
- `--help` and `--version` write stdout and exit with code `0` from `bin/agentop.js`.
- `lib/processes.js` returns `[]` if `ps` fails and leaves `cwd` as `null` if cwd resolution fails.
- Providers catch missing/unreadable local files and return partial records with `rawState: 'no-session'` or `rawState: 'unknown'`.
- `lib/jsonl.js` skips malformed/truncated JSONL lines and returns `[]` for missing files.
- `lib/ui.js` registers cleanup handlers for `SIGINT`, `SIGTERM`, process exit, and explicit quit keys.
## Cross-Cutting Concerns
- Normal user output is written directly to `process.stdout` in `bin/agentop.js` and `lib/ui.js`.
- User-facing CLI errors are written directly to `process.stderr` in `bin/agentop.js`.
- Provider enrichment errors are intentionally not surfaced in the TUI.
- CLI argument validation lives in `parseArgs` in `bin/agentop.js`.
- Sort-key validation uses `SORTS` from `lib/render.js`.
- State thresholds live in `classifyState` in `lib/state.js`.
- Regression tests live in `test/cli.test.js`, `test/render.test.js`, `test/providers.test.js`, `test/state.test.js`, and related test files.
- Supported OS targets are Linux and macOS in `package.json`.
- Linux cwd resolution reads `/proc/<pid>/cwd` in `lib/processes.js`.
- macOS cwd resolution shells out to `lsof` in `lib/processes.js`.
- Codex enrichment optionally shells out to `sqlite3` in `lib/providers/codex.js`.
- The app reads local process/session state and does not send data over the network.
- Demo mode uses fabricated paths in `lib/demo.js` and is tested in `test/demo.test.js`.
- Providers should avoid logging transcript contents or filesystem errors to the terminal.
- Add new agent integrations as new files under `lib/providers/`.
- Register new providers in the `PROVIDERS` array in `lib/collect.js`.
- Keep provider records compatible with `lib/render.js` and JSON output from `bin/agentop.js`.
- Add provider match, summary, and collect tests in `test/providers.test.js` or a focused provider test file.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
