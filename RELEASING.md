# Releasing agentop

This is the exact, reproducible procedure for cutting a release. Following it from a clean checkout
produces a GitHub Release with standalone binaries + checksums attached, and publishes the package
to npm and JSR — all driven by CI.

## What automation fires

A release is triggered by **publishing a GitHub Release** (`.github/workflows/publish.yml`,
`on: release: [published]`). Three independent jobs then run:

| Job        | What it does                                                                                                                                  | Coupling    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `npm`      | OIDC trusted publish — `npm publish` (the `prepublishOnly` hook runs `tsc` → `dist/`)                                                         | independent |
| `jsr`      | `deno publish` to JSR (`continue-on-error`)                                                                                                   | independent |
| `binaries` | calls the reusable `build-binaries.yml`, which cross-compiles all four unix targets, makes SHA-256 checksums, and uploads them to the release | independent |

The three jobs have **no `needs:` between them** — a binary-build failure can never block or break
the npm/JSR publish, and vice versa.

The reusable binary builder (`.github/workflows/build-binaries.yml`) can also be run on its own via
**Actions → Build Binaries → Run workflow** (`workflow_dispatch`) to verify cross-compilation
without cutting a release.

## Prerequisites (one-time)

- npm OIDC Trusted Publishing configured for the `agentop` package.
- JSR `@ktamas77` scope + `agentop` package created (or accept that the `jsr` job is
  `continue-on-error`).
- Push access to `ktamas77/agentop` and permission to create releases.

## Steps

### 1. Pick the version and bump it in BOTH manifests

The compiled binary and JSR read the version from `deno.json`; npm reads it from `package.json`.
**They must stay in sync** — bump both to the same value.

```sh
# edit "version" in deno.json AND package.json to the new X.Y.Z (no leading v)
git grep -n '"version"' deno.json package.json   # confirm they match
```

### 2. Update the changelog

Add the new version's notes to `CHANGELOG.md`.

### 3. Verify locally (clean checkout sanity)

```sh
deno task check          # fmt + lint + check + test
npm run build            # tsc -> dist/ (what npm publishes)
deno task compile        # standalone host binary -> dist-bin/agentop
./dist-bin/agentop --version   # must print: agentop X.Y.Z  (matches deno.json)
```

### 4. Commit and tag

Tag with a leading `v`; the version inside the files has no `v`.

```sh
git add deno.json package.json CHANGELOG.md
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

### 5. Create the GitHub Release

Creating/publishing the Release for tag `vX.Y.Z` is what triggers CI.

```sh
gh release create vX.Y.Z --title "vX.Y.Z" --notes-from-tag
# or: gh release create vX.Y.Z --generate-notes
```

If you create the release as a **draft**, publishing it later is what fires the workflow.

### 6. Verify the release ran

On the Actions run for the release, confirm:

- **binaries** job attached all four assets + checksums to the release:
  - `agentop-x86_64-unknown-linux-gnu` (+ `.sha256`)
  - `agentop-aarch64-unknown-linux-gnu` (+ `.sha256`)
  - `agentop-x86_64-apple-darwin` (+ `.sha256`)
  - `agentop-aarch64-apple-darwin` (+ `.sha256`)
- **npm** job published the new version (`npm view agentop version`).
- **jsr** job published (or failed softly if JSR isn't set up).

### 7. Smoke-test the installer

```sh
curl -fsSL https://raw.githubusercontent.com/ktamas77/agentop/main/install.sh | sh
agentop --version    # should print the new version
```

## Notes

- **Binary size:** each build is ~137 MB (embedded Deno runtime). They live only as release assets —
  `dist-bin/` is gitignored and never committed.
- **macOS signing:** binaries are unsigned today; `install.sh` strips the Gatekeeper quarantine
  attribute automatically (manual downloads need `xattr -d com.apple.quarantine ./agentop`).
  Code-signing/notarization is a future change.
- **Windows:** not built yet — the binary would compile but cannot discover agents until the process
  layer gains a Windows path. Tracked for a future milestone.
- **Homebrew:** the tap (`ktamas77/tap`) lives in a separate repo and is updated there; it is not
  part of this release flow.
