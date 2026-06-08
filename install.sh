#!/bin/sh
# agentop installer — downloads the latest standalone binary from GitHub Releases,
# verifies its SHA-256 checksum, and installs it onto your PATH.
#
#   curl -fsSL https://raw.githubusercontent.com/ktamas77/agentop/main/install.sh | sh
#
# Supported: Linux and macOS, x86_64 and arm64. Windows is not supported yet.
#
# Environment overrides:
#   AGENTOP_VERSION       pin a release tag (e.g. v0.5.3); default: latest
#   AGENTOP_INSTALL_DIR   install directory; default: /usr/local/bin or ~/.local/bin
#   AGENTOP_BASE_URL      override the download base URL (advanced / mirrors / tests)
#   AGENTOP_OS            override OS detection (linux|darwin)
#   AGENTOP_ARCH          override arch detection (x86_64|aarch64)
set -eu

REPO="ktamas77/agentop"
BIN_NAME="agentop"

err() { printf 'agentop install: %s\n' "$1" >&2; }
die() { err "$1"; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# --- detect OS -------------------------------------------------------------
detect_os() {
  if [ -n "${AGENTOP_OS:-}" ]; then printf '%s' "$AGENTOP_OS"; return; fi
  case "$(uname -s)" in
    Linux) printf 'linux' ;;
    Darwin) printf 'darwin' ;;
    *) die "unsupported OS '$(uname -s)'. Standalone binaries support Linux and macOS only; on Windows use WSL, or install via npm: npm install -g agentop" ;;
  esac
}

# --- detect arch -----------------------------------------------------------
detect_arch() {
  if [ -n "${AGENTOP_ARCH:-}" ]; then printf '%s' "$AGENTOP_ARCH"; return; fi
  case "$(uname -m)" in
    x86_64 | amd64) printf 'x86_64' ;;
    arm64 | aarch64) printf 'aarch64' ;;
    *) die "unsupported architecture '$(uname -m)'. Supported: x86_64, arm64" ;;
  esac
}

# --- map to the release asset triple (must match the build-binaries workflow) ---
target_triple() {
  os="$1"; arch="$2"
  case "$os" in
    linux) printf '%s-unknown-linux-gnu' "$arch" ;;
    darwin) printf '%s-apple-darwin' "$arch" ;;
    *) die "internal: unmapped os '$os'" ;;
  esac
}

# --- choose an install dir -------------------------------------------------
choose_install_dir() {
  if [ -n "${AGENTOP_INSTALL_DIR:-}" ]; then printf '%s' "$AGENTOP_INSTALL_DIR"; return; fi
  if [ -w /usr/local/bin ] 2>/dev/null; then printf '/usr/local/bin'; return; fi
  printf '%s/.local/bin' "$HOME"
}

# --- sha256 verification (cross-platform) ----------------------------------
verify_checksum() {
  # args: <checksum-file> ; verifies the file it references in the cwd
  if have sha256sum; then sha256sum -c "$1" >/dev/null 2>&1
  elif have shasum; then shasum -a 256 -c "$1" >/dev/null 2>&1
  else die "no sha256 tool found (need sha256sum or shasum)"; fi
}

download() {
  # args: <url> <dest>
  if have curl; then curl -fsSL "$1" -o "$2"
  elif have wget; then wget -qO "$2" "$1"
  else die "need curl or wget to download"; fi
}

main() {
  os="$(detect_os)"
  arch="$(detect_arch)"
  triple="$(target_triple "$os" "$arch")"
  asset="${BIN_NAME}-${triple}"

  if [ -n "${AGENTOP_BASE_URL:-}" ]; then
    base="$AGENTOP_BASE_URL"
  elif [ -n "${AGENTOP_VERSION:-}" ]; then
    base="https://github.com/${REPO}/releases/download/${AGENTOP_VERSION}"
  else
    base="https://github.com/${REPO}/releases/latest/download"
  fi

  printf 'agentop install: %s / %s -> %s\n' "$os" "$arch" "$asset"

  tmp="$(mktemp -d 2>/dev/null || mktemp -d -t agentop)"
  trap 'rm -rf "$tmp"' EXIT INT TERM

  printf 'agentop install: downloading %s\n' "$asset"
  download "${base}/${asset}" "${tmp}/${asset}" || die "download failed: ${base}/${asset}"
  download "${base}/${asset}.sha256" "${tmp}/${asset}.sha256" || die "checksum download failed"

  printf 'agentop install: verifying checksum\n'
  ( cd "$tmp" && verify_checksum "${asset}.sha256" ) || die "checksum verification FAILED — refusing to install"

  dir="$(choose_install_dir)"
  mkdir -p "$dir" || die "cannot create install dir: $dir"
  dest="${dir}/${BIN_NAME}"

  if have install; then install -m 0755 "${tmp}/${asset}" "$dest"
  else cp "${tmp}/${asset}" "$dest" && chmod 0755 "$dest"; fi

  # macOS: clear the quarantine attribute so Gatekeeper doesn't block the binary.
  if [ "$os" = "darwin" ] && have xattr; then
    xattr -d com.apple.quarantine "$dest" >/dev/null 2>&1 || true
  fi

  printf 'agentop install: installed to %s\n' "$dest"
  case ":${PATH}:" in
    *":${dir}:"*) : ;;
    *) printf 'agentop install: NOTE %s is not on your PATH — add: export PATH="%s:$PATH"\n' "$dir" "$dir" ;;
  esac
  "$dest" --version || true
}

main "$@"
