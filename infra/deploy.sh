#!/usr/bin/env bash
# Nyx Audio — deploy from git. Runs ON THE SERVER.
#
#   ./deploy.sh              # pull, rebuild whatever is stale, reconcile, verify
#   ./deploy.sh --yes        # no prompts
#   ./deploy.sh --no-pull    # deploy what is already checked out
#
# Decides what to rebuild by ASKING the running client and API which commit
# they were built from, and comparing against HEAD. An earlier version
# inferred it from what that run had pulled — so pulling first and deploying
# second rebuilt nothing, and then reported success over the old build.
#
# Everything machine-specific is gitignored (.env, caddy/certs/,
# conf.d/tailscale.caddy, .deploy.env), so a pull cannot overwrite this
# machine's own configuration.
#
# Exits non-zero if anything is left stale. "Done" means done.
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
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
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

PROBLEMS=()
problem() { PROBLEMS+=("$*"); printf '   %s✗%s %s\n' "$RED" "$OFF" "$*"; }

[[ "$(uname -s)" == "Linux" ]] || die "This runs on the server, not on your workstation."
command -v docker >/dev/null || die "docker is not installed."

env_value() { grep -E "^$1=" "$INFRA/.env" 2>/dev/null | tail -1 | cut -d= -f2-; }
PUID="$(env_value PUID)";         PUID="${PUID:-$(id -u)}"
PGID="$(env_value PGID)";         PGID="${PGID:-$(id -g)}"
DATA_DIR="$(env_value DATA_DIR)"; DATA_DIR="${DATA_DIR:-/srv/nyx}"
MUSIC_DIR="$(env_value MUSIC_DIR)"; MUSIC_DIR="${MUSIC_DIR:-/srv/music}"
WEB_DIR="$(env_value WEB_DIR)";   WEB_DIR="${WEB_DIR:-/srv/nyx/web}"

commit_of() {  # the "commit" field of a JSON document on stdin, or empty
  sed -nE 's/.*"commit"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' | head -1
}

# True when the thing built from $1 is stale relative to HEAD for these paths.
# An unknown or unrecognised commit is stale by definition.
stale() {
  local built="$1"; shift
  [[ -z "$built" || "$built" == "unknown" ]] && return 0
  git -C "$REPO" cat-file -e "${built}^{commit}" 2>/dev/null || return 0
  ! git -C "$REPO" diff --quiet "$built" HEAD -- "$@"
}

# ── 1. Source ────────────────────────────────────────────────────────────
step "1. Source"

if (( PULL )); then
  if [[ -n "$(git -C "$REPO" status --porcelain --untracked-files=no 2>/dev/null)" ]]; then
    warn "the working tree has local edits:"
    git -C "$REPO" status --short --untracked-files=no | sed 's/^/      /'
    ask "Pull anyway? (edits stay, but the merge may conflict)" || die "Nothing changed."
  fi
  git -C "$REPO" pull --ff-only --quiet || die "Pull failed. Resolve it and re-run."
fi

HEAD="$(git -C "$REPO" rev-parse --short HEAD)"
export NYX_COMMIT="$HEAD"
good "HEAD is $HEAD — $(git -C "$REPO" log -1 --format=%s)"

# ── 2. Directories ───────────────────────────────────────────────────────
step "2. Directories"

# Docker creates a missing bind-mount source as root, and every container here
# runs as $PUID. A root-owned import directory makes nyx-api fail at startup,
# so this is checked every time rather than assumed.
NEEDS_OWNERSHIP=()
for d in "$DATA_DIR/api" "$DATA_DIR/import" "$DATA_DIR/navidrome" "$WEB_DIR" "$MUSIC_DIR"; do
  if [[ -d "$d" && -w "$d" && "$(stat -c %u "$d")" == "$PUID" ]]; then
    have "$d"
  else
    NEEDS_OWNERSHIP+=("$d")
  fi
done

if (( ${#NEEDS_OWNERSHIP[@]} )); then
  info "these are missing, or not owned by uid $PUID:"
  printf '      %s\n' "${NEEDS_OWNERSHIP[@]}"
  if ask "Create them and set ownership (needs sudo)?"; then
    for d in "${NEEDS_OWNERSHIP[@]}"; do
      sudo mkdir -p "$d" && sudo chown -R "$PUID:$PGID" "$d" \
        && good "$d" || problem "could not prepare $d"
    done
  else
    problem "directories not prepared; nyx-api may not start"
  fi
fi

# ── 3. Client ────────────────────────────────────────────────────────────
step "3. Client"

WEB_BUILT="$(curl -sS --max-time 5 http://localhost/version.json 2>/dev/null | commit_of)"
info "served build: ${WEB_BUILT:-none (predates build stamping)}"

# packages/ and the lockfile count: the client is built from both.
if ! stale "$WEB_BUILT" apps/web packages pnpm-lock.yaml; then
  have "client is current"
elif ! command -v pnpm >/dev/null; then
  problem "client is stale and pnpm is not installed, so it cannot be built here"
  info "one-time fix:  ./setup-node.sh   (or run deploy-web.sh from your workstation)"
else
  info "building — slower on a Pi than a laptop, but it keeps deploys to one command"
  if (cd "$REPO" && pnpm install --frozen-lockfile --silent && pnpm --filter @nyx/web build >/dev/null); then
    DIST="$REPO/apps/web/dist"
    mkdir -p "$WEB_DIR"
    # --delete is safe: this directory holds only build output, and hashed
    # asset names would otherwise accumulate forever.
    if rsync -a --delete "$DIST/" "$WEB_DIR/" 2>/dev/null || cp -r "$DIST/." "$WEB_DIR/"; then
      good "built $HEAD and published to $WEB_DIR"
    else
      problem "built, but could not publish to $WEB_DIR"
    fi
  else
    problem "client build failed"
  fi
fi

# ── 4. Services ──────────────────────────────────────────────────────────
step "4. Services"

API_BUILT="$(curl -sS --max-time 5 http://localhost/api/health 2>/dev/null | commit_of)"
info "running API: ${API_BUILT:-unknown (predates build stamping)}"

if stale "$API_BUILT" apps/api; then
  info "rebuilding nyx-api — the first build installs beets and ffmpeg, allow several minutes"
  docker compose build nyx-api || problem "nyx-api image build failed"
else
  have "API is current"
fi

docker compose up -d --remove-orphans >/dev/null 2>&1 || problem "docker compose up failed"

# Give a freshly recreated API a moment before judging it.
for _ in $(seq 1 20); do
  curl -sS --max-time 2 http://localhost/api/health >/dev/null 2>&1 && break
  sleep 1
done
docker compose ps --format '   {{.Name}}  {{.Status}}' 2>/dev/null

# ── 5. Routing ───────────────────────────────────────────────────────────
step "5. Routing"
./render-caddy.sh || problem "could not reconcile Caddy"
sleep 2

# ── 6. Verify ────────────────────────────────────────────────────────────
step "6. Verify"

# The same staleness test as above, applied to what is serving NOW. Checking
# only that "a Nyx client" answers is how the old bundle passed last time.
WEB_NOW="$(curl -sS --max-time 10 http://localhost/version.json 2>/dev/null | commit_of)"
if [[ -z "$WEB_NOW" ]]; then
  problem "the served client has no build stamp — it is an old bundle"
elif stale "$WEB_NOW" apps/web packages pnpm-lock.yaml; then
  problem "the served client ($WEB_NOW) is behind HEAD ($HEAD)"
else
  good "client built from $WEB_NOW"
fi

HEALTH="$(curl -sS --max-time 10 http://localhost/api/health 2>/dev/null || true)"
API_NOW="$(commit_of <<< "$HEALTH")"
if ! grep -q '"ok"[[:space:]]*:[[:space:]]*true' <<< "$HEALTH"; then
  problem "nyx-api is not answering — docker compose logs nyx-api | tail -30"
elif stale "$API_NOW" apps/api; then
  problem "nyx-api (${API_NOW:-unknown}) is behind HEAD ($HEAD)"
else
  good "nyx-api built from $API_NOW"
fi

IMPORT_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://localhost/api/import/batches 2>/dev/null || echo 000)"
[[ "$IMPORT_CODE" == "200" ]] && good "import endpoints answering" \
  || problem "import endpoints returned $IMPORT_CODE"

if (( ${#PROBLEMS[@]} )); then
  printf '\n%s▚ Finished with %d problem%s:%s\n' "$BOLD" "${#PROBLEMS[@]}" \
    "$([[ ${#PROBLEMS[@]} -eq 1 ]] || echo s)" "$OFF"
  printf '   %s\n' "${PROBLEMS[@]}"
  printf '\n'
  exit 1
fi

printf '\n%s▚ Done — everything is at %s.%s\n\n' "$BOLD" "$HEAD" "$OFF"
