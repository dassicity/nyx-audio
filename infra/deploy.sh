#!/usr/bin/env bash
# Nyx Audio — deploy from git. Runs ON THE SERVER.
#
#   ./deploy.sh              # pull, rebuild what changed, reconcile, verify
#   ./deploy.sh --yes        # no prompts
#   ./deploy.sh --no-pull    # deploy what is already checked out
#
# Everything machine-specific is gitignored — .env, caddy/certs/,
# conf.d/tailscale.caddy, .deploy.env — so a pull cannot overwrite this
# machine's own configuration. That is why this is safe to run unattended
# and why it needs no exclude list.
#
# The one thing git does not carry is apps/web/dist: build output does not
# belong in a repository. Either this script builds it here, or you build it
# on your workstation and send it with infra/deploy-web.sh.
set -uo pipefail
cd "$(dirname "$0")"
INFRA="$PWD"
REPO="$(cd .. && pwd)"

ASSUME_YES=0
PULL=1
for a in "$@"; do
  case "$a" in
    --yes) ASSUME_YES=1 ;;
    --no-pull) PULL=0 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

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

[[ "$(uname -s)" == "Linux" ]] || die "This runs on the server, not on your workstation."

# ── 1. Pull ──────────────────────────────────────────────────────────────
step "1. Source"

BEFORE="$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo none)"

if (( PULL )); then
  # A dirty tree here means someone edited files on the server. Merging over
  # that silently is how you lose a fix nobody wrote down.
  if [[ -n "$(git -C "$REPO" status --porcelain 2>/dev/null)" ]]; then
    warn "the working tree has local changes:"
    git -C "$REPO" status --short | sed 's/^/      /'
    ask "Pull anyway? (your changes stay, but the merge may conflict)" \
      || die "Nothing changed."
  fi
  git -C "$REPO" pull --ff-only || die "Pull failed. Resolve it and re-run."
fi

AFTER="$(git -C "$REPO" rev-parse --short HEAD)"
if [[ "$BEFORE" == "$AFTER" ]]; then
  have "already at $AFTER"
else
  good "$BEFORE → $AFTER"
  git -C "$REPO" log --oneline "$BEFORE..$AFTER" 2>/dev/null | sed 's/^/      /' | head -10
fi

CHANGED="$(git -C "$REPO" diff --name-only "$BEFORE" "$AFTER" 2>/dev/null || echo ALL)"
changed_in() { [[ "$CHANGED" == "ALL" ]] || grep -q "^$1" <<< "$CHANGED"; }

# ── 2. The client bundle ─────────────────────────────────────────────────
step "2. Client"

DIST="$REPO/apps/web/dist"

if ! changed_in "apps/web" && [[ -f "$DIST/index.html" ]]; then
  have "no client changes; keeping the current bundle"
elif command -v pnpm >/dev/null; then
  info "building here — this is slower than a workstation but keeps deploys to one command"
  (cd "$REPO" && pnpm install --frozen-lockfile --silent && pnpm --filter @nyx/web build) \
    || die "Client build failed; nothing was deployed."
  good "built $(find "$DIST" -type f | wc -l | tr -d ' ') files"
elif [[ -f "$DIST/index.html" ]]; then
  warn "pnpm is not installed, so the client was not rebuilt"
  info "the existing bundle is still being served; to update it, run"
  info "infra/deploy-web.sh from your workstation"
else
  warn "no client bundle and no pnpm to build one"
  info "run infra/deploy-web.sh from your workstation, or install pnpm here"
fi

# Caddy serves from WEB_DIR, which is outside the repo.
WEB_DIR="$(grep -E '^WEB_DIR=' "$INFRA/.env" 2>/dev/null | cut -d= -f2)"
WEB_DIR="${WEB_DIR:-/srv/nyx/web}"
if [[ -f "$DIST/index.html" ]]; then
  mkdir -p "$WEB_DIR"
  # --delete is safe: this directory holds only build output, and Vite's
  # content-hashed filenames would otherwise accumulate forever.
  if rsync -a --delete "$DIST/" "$WEB_DIR/" 2>/dev/null || cp -r "$DIST/." "$WEB_DIR/"; then
    good "published to $WEB_DIR"
  else
    warn "could not publish the bundle to $WEB_DIR"
  fi
fi

# ── 3. Services ──────────────────────────────────────────────────────────
step "3. Services"

command -v docker >/dev/null || die "docker is not installed."

if changed_in "apps/api"; then
  info "nyx-api changed; rebuilding its image (beets and ffmpeg make this slow)"
  docker compose build nyx-api || die "Image build failed."
fi

docker compose up -d || die "Could not bring the stack up."
docker compose ps --format '   {{.Name}}  {{.Status}}' 2>/dev/null || docker compose ps

# ── 4. Caddy ─────────────────────────────────────────────────────────────
step "4. Routing"

# Regenerates the tailnet fragment from its template and makes Caddy re-read
# its configuration. Both matter: a correct file that Caddy has never read is
# indistinguishable from a wrong one.
./render-caddy.sh || warn "could not reconcile Caddy"

# ── 5. Verify ────────────────────────────────────────────────────────────
step "5. Verify"

sleep 2
TITLE="$(curl -sS --max-time 10 http://localhost/ 2>/dev/null | grep -o '<title>[^<]*' | sed 's/<title>//')"
if [[ "$TITLE" == "Nyx Audio" ]]; then
  good "serving the Nyx client"
else
  warn "unexpected page title: '${TITLE:-none}'"
  info "if this says Navidrome, Caddy is serving the library server at / —"
  info "check: docker compose logs caddy | tail -20"
fi

API="$(curl -sS --max-time 10 http://localhost/api/health 2>/dev/null || true)"
if grep -q '"ok":true' <<< "$API"; then
  good "nyx-api healthy — $(sed -E 's/.*"plays":([0-9]+).*/\1/' <<< "$API") plays recorded"
else
  warn "nyx-api did not answer /api/health"
  info "check: docker compose logs nyx-api | tail -20"
fi

printf '\n%s▚ Done.%s\n\n' "$BOLD" "$OFF"
