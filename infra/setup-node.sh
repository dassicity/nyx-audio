#!/usr/bin/env bash
# Nyx Audio — install Node and pnpm on the server, once.
#
#   ./setup-node.sh
#
# Only needed if you deploy purely from git, so the server builds the client
# itself. docs/tech-stack.md D9 prefers building on a workstation and sending
# the bundle (infra/deploy-web.sh); this is the other choice, and it costs a
# JS toolchain on the Pi in exchange for one-command deploys.
#
# Checks what apt actually offers before installing anything rather than
# assuming a version, and stops with an explanation if it is too old.
set -uo pipefail

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'; OFF=$'\033[0m'
step() { printf '\n%s▚ %s%s\n' "$BOLD" "$*" "$OFF"; }
info() { printf '   %s\n' "$*"; }
good() { printf '   %s✓%s %s\n' "$GRN" "$OFF" "$*"; }
have() { printf '   %s·%s already done: %s\n' "$DIM" "$OFF" "$*"; }
die()  { printf '\n   %s✗ %s%s\n\n' "$RED" "$*" "$OFF" >&2; exit 1; }
ask()  { local r; read -r -p "   $1 [y/N] " r; [[ "$r" =~ ^[Yy] ]]; }

# Vite 6 needs Node 20 or newer. The lockfile is pnpm 9.
NODE_MIN=20
PNPM_MAJOR=9

[[ "$(uname -s)" == "Linux" ]] || die "This runs on the server, not on your workstation."

major_of() { sed -E 's/^[0-9]+://; s/^v//; s/[^0-9].*//' <<< "$1"; }

# ── 1. Node ──────────────────────────────────────────────────────────────
step "1. Node"

if command -v node >/dev/null && (( $(major_of "$(node --version)") >= NODE_MIN )); then
  have "node $(node --version)"
else
  sudo apt-get update -qq
  CANDIDATE="$(apt-cache policy nodejs 2>/dev/null | awk '/Candidate:/ {print $2}')"
  [[ -n "$CANDIDATE" && "$CANDIDATE" != "(none)" ]] \
    || die "apt has no nodejs package on this system."

  MAJOR="$(major_of "$CANDIDATE")"
  info "apt offers nodejs $CANDIDATE"
  (( MAJOR >= NODE_MIN )) || die "That is Node $MAJOR; the client build needs $NODE_MIN or newer. Use deploy-web.sh from your workstation instead."

  ask "Install nodejs and npm from apt?" || die "Nothing changed."
  sudo apt-get install -y nodejs npm || die "apt install failed."
  good "installed node $(node --version)"
fi

# ── 2. pnpm ──────────────────────────────────────────────────────────────
step "2. pnpm"

if command -v pnpm >/dev/null && [[ "$(major_of "$(pnpm --version)")" == "$PNPM_MAJOR" ]]; then
  have "pnpm $(pnpm --version)"
else
  # Pinned to the lockfile's major. corepack would fetch the newest pnpm,
  # which is how pnpm 11 failed to load on this project's Node once already.
  ask "Install pnpm $PNPM_MAJOR globally with npm?" || die "Nothing changed."
  sudo npm install -g "pnpm@$PNPM_MAJOR" || die "npm install -g pnpm failed."
  good "installed pnpm $(pnpm --version)"
fi

printf '\n%s▚ Done.%s Now run ./deploy.sh\n\n' "$BOLD" "$OFF"
