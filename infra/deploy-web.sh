#!/usr/bin/env bash
# Nyx Audio — build the client and deploy it to the Pi.
#
#   ./deploy-web.sh                 # build, confirm, deploy
#   ./deploy-web.sh --yes           # no prompts
#   NYX_HOST=nyx.local ./deploy-web.sh
#
# Runs on your LAPTOP. The Pi does not build anything (docs/tech-stack.md D9):
# cross-compiling a frontend on a 4 GB ARM board is slow and buys nothing.
#
# Reports what it finds at each step and is safe to re-run.
set -uo pipefail
cd "$(dirname "$0")/.."

NYX_HOST="${NYX_HOST:-nyx.local}"
NYX_USER="${NYX_USER:-nil}"
WEB_DIR="${WEB_DIR:-/srv/nyx/web}"
ASSUME_YES=0
[[ "${1:-}" == "--yes" ]] && ASSUME_YES=1

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; OFF=$'\033[0m'
step() { printf '\n%s▚ %s%s\n' "$BOLD" "$*" "$OFF"; }
info() { printf '   %s\n' "$*"; }
good() { printf '   %s✓%s %s\n' "$GRN" "$OFF" "$*"; }
have() { printf '   %s·%s %s\n' "$DIM" "$OFF" "$*"; }
warn() { printf '   %s!%s %s\n' "$YLW" "$OFF" "$*"; }
die()  { printf '\n   %s✗ %s%s\n\n' "$RED" "$*" "$OFF" >&2; exit 1; }
ask()  {
  (( ASSUME_YES )) && { info "$1 — assuming yes"; return 0; }
  local r; read -r -p "   $1 [y/N] " r; [[ "$r" =~ ^[Yy] ]]
}

# ── 1. Reachability ──────────────────────────────────────────────────────
step "1. Checking the Pi"
info "host: ${NYX_USER}@${NYX_HOST}   target: ${WEB_DIR}"

if ! ssh -o ConnectTimeout=6 -o BatchMode=yes "${NYX_USER}@${NYX_HOST}" true 2>/dev/null; then
  warn "cannot reach ${NYX_HOST} over ssh without a password prompt."
  info "DHCP moves LAN addresses and mDNS caches go stale — the tailnet name"
  info "is stable. Try:  NYX_HOST=nyx.<your-tailnet>.ts.net $0"
  ask "Continue anyway (you may be prompted for a password)?" || die "Nothing changed."
else
  good "ssh works"
fi

# ── 2. Build ─────────────────────────────────────────────────────────────
step "2. Building the client"
command -v pnpm >/dev/null || die "pnpm not found."
pnpm --filter @nyx/web build || die "Build failed — nothing was deployed."

DIST="apps/web/dist"
[[ -f "$DIST/index.html" ]] || die "No $DIST/index.html after build."
good "built $(find "$DIST" -type f | wc -l | tr -d ' ') files, $(du -sh "$DIST" | cut -f1)"

# The client must call relative paths only: in production Caddy serves it from
# the same origin as the API, and an absolute dev URL would break that.
if grep -rqE 'https?://(localhost|nyx\.local|[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)' "$DIST"/assets/*.js 2>/dev/null; then
  warn "the bundle contains a hard-coded host — it should only use relative paths"
  info "check for a NYX_SERVER value leaking out of .env.local into the build"
  ask "Deploy anyway?" || die "Nothing changed."
else
  good "no hard-coded hosts in the bundle"
fi

# ── 3. Deploy ────────────────────────────────────────────────────────────
step "3. Deploying"
ssh "${NYX_USER}@${NYX_HOST}" "sudo mkdir -p '${WEB_DIR}' && sudo chown -R \$(id -u):\$(id -g) '${WEB_DIR}'" \
  || die "Could not prepare ${WEB_DIR} on the Pi."

ask "rsync $DIST/ → ${NYX_HOST}:${WEB_DIR}/ (deletes files no longer in the build)?" \
  || die "Nothing changed."

# --delete is safe here: WEB_DIR holds only build output, and stale hashed
# assets would otherwise accumulate forever.
rsync -ah --delete --progress "$DIST/" "${NYX_USER}@${NYX_HOST}:${WEB_DIR}/" \
  || die "rsync failed."
good "deployed"

# ── 4. Verify ────────────────────────────────────────────────────────────
step "4. Verifying"
CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "http://${NYX_HOST}/" 2>/dev/null || echo 000)"
case "$CODE" in
  2*) good "http://${NYX_HOST}/ returned $CODE" ;;
  000) warn "no response. Is the stack up?  ssh ${NYX_USER}@${NYX_HOST} 'cd ~/nyx-audio/infra && docker compose ps'" ;;
  *)  warn "http://${NYX_HOST}/ returned $CODE"
      info "if this is 404, Caddy may not have picked up the new root:"
      info "  ssh ${NYX_USER}@${NYX_HOST} 'cd ~/nyx-audio/infra && docker compose restart caddy'" ;;
esac

TITLE="$(curl -sS --max-time 10 "http://${NYX_HOST}/" 2>/dev/null | grep -o '<title>[^<]*' | sed 's/<title>//')"
[[ "$TITLE" == "Nyx Audio" ]] && good "serving the Nyx client (title: $TITLE)" \
  || warn "unexpected page title: '${TITLE:-none}' — Caddy may still be serving Navidrome"

printf '\n%s▚ Done.%s\n' "$BOLD" "$OFF"
info "Client:          http://${NYX_HOST}/"
info "Navidrome admin: http://${NYX_HOST}/app/"
printf '\n'
