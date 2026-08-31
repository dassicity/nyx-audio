#!/usr/bin/env bash
# Nyx Audio — build the client and deploy it to the server.
#
#   ./deploy-web.sh              # configures itself on first run
#   ./deploy-web.sh --yes        # no prompts (needs .deploy.env or env vars)
#   ./deploy-web.sh --reconfigure
#
# Runs on your workstation. The server builds nothing (docs/tech-stack.md D9).
#
# Settings resolve in this order: environment variables, then .deploy.env,
# then it asks and offers to save. Nothing about any particular machine is
# baked into this file.
set -uo pipefail
cd "$(dirname "$0")"
INFRA_DIR="$PWD"
cd ..

CONF="$INFRA_DIR/.deploy.env"
ASSUME_YES=0
RECONFIGURE=0
for a in "$@"; do
  case "$a" in
    --yes) ASSUME_YES=1 ;;
    --reconfigure) RECONFIGURE=1 ;;
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
prompt() { # prompt <question> <default> -> echoes the answer
  local q="$1" d="${2:-}" r
  if (( ASSUME_YES )); then printf '%s' "$d"; return; fi
  read -r -p "   $q${d:+ [$d]}: " r </dev/tty
  printf '%s' "${r:-$d}"
}

# ── 1. Configuration ─────────────────────────────────────────────────────
step "1. Configuration"

# shellcheck source=/dev/null
[[ -f "$CONF" ]] && (( ! RECONFIGURE )) && { source "$CONF"; have "loaded $(basename "$CONF")"; }

NYX_HOST="${NYX_HOST:-}"
NYX_USER="${NYX_USER:-}"
WEB_DIR="${WEB_DIR:-/srv/nyx/web}"
SSH_KEY="${SSH_KEY:-}"

if [[ -z "$NYX_HOST" ]] || (( RECONFIGURE )); then
  info "Where is Nyx running? A hostname, an IP, or an ssh alias."
  info "A Tailscale name survives DHCP reassignment; an mDNS name may not."
  NYX_HOST="$(prompt "Server host" "${NYX_HOST:-nyx.local}")"
  NYX_USER="$(prompt "Login on that machine" "${NYX_USER:-$USER}")"
  WEB_DIR="$(prompt "Client directory on the server" "$WEB_DIR")"

  if ask "Save these to infra/.deploy.env (gitignored)?"; then
    cat > "$CONF" <<EOF
# Written by deploy-web.sh. Gitignored — machine-specific.
NYX_HOST=$NYX_HOST
NYX_USER=$NYX_USER
WEB_DIR=$WEB_DIR
SSH_KEY=$SSH_KEY
EOF
    good "saved $CONF"
  fi
fi
[[ -n "$NYX_HOST" ]] || die "No server host set."
NYX_USER="${NYX_USER:-$USER}"
TARGET="${NYX_USER}@${NYX_HOST}"
SSH_OPTS=(-o ConnectTimeout=8)
[[ -n "$SSH_KEY" ]] && SSH_OPTS+=(-i "$SSH_KEY" -o IdentitiesOnly=yes)
info "deploying to ${TARGET}:${WEB_DIR}"

# ── 2. Access ────────────────────────────────────────────────────────────
step "2. Checking access"

if ssh "${SSH_OPTS[@]}" -o BatchMode=yes "$TARGET" true 2>/dev/null; then
  good "ssh works without a password"
else
  warn "ssh to $TARGET needs a password (or is unreachable)."
  info "Every deploy, rsync and remote command will keep prompting until a"
  info "key is installed. It is a one-time setup."
  if ask "Set up an ssh key for this server now?"; then
    KEY="${SSH_KEY:-$HOME/.ssh/nyx-deploy}"
    if [[ -f "$KEY" ]]; then
      have "using existing key $KEY"
    else
      # No passphrase: this is an unattended deploy key for a machine you own.
      # Use an existing passphrase-protected key via SSH_KEY if you prefer.
      ssh-keygen -t ed25519 -f "$KEY" -N "" -C "nyx-audio deploy" -q \
        || die "Could not generate a key."
      good "generated $KEY"
    fi
    info "Installing the public key — this asks for your server password once."
    ssh-copy-id -i "${KEY}.pub" "$TARGET" || die "ssh-copy-id failed."
    SSH_KEY="$KEY"
    SSH_OPTS=(-o ConnectTimeout=8 -i "$SSH_KEY" -o IdentitiesOnly=yes)
    [[ -f "$CONF" ]] && { grep -v '^SSH_KEY=' "$CONF" > "$CONF.tmp"; echo "SSH_KEY=$SSH_KEY" >> "$CONF.tmp"; mv "$CONF.tmp" "$CONF"; }
    ssh "${SSH_OPTS[@]}" -o BatchMode=yes "$TARGET" true 2>/dev/null \
      && good "ssh now works without a password" \
      || warn "still prompting — check the server's ~/.ssh/authorized_keys"
  else
    ask "Continue with password prompts?" || die "Nothing changed."
  fi
fi

# ── 3. Build ─────────────────────────────────────────────────────────────
step "3. Building the client"
command -v pnpm >/dev/null || die "pnpm not found. Install it, then re-run."
pnpm --filter @nyx/web build || die "Build failed — nothing was deployed."

DIST="apps/web/dist"
[[ -f "$DIST/index.html" ]] || die "No $DIST/index.html after build."
good "built $(find "$DIST" -type f | wc -l | tr -d ' ') files, $(du -sh "$DIST" | cut -f1)"

# The client must use relative paths: Caddy serves it from the same origin as
# the API. A dev-only NYX_SERVER leaking into the bundle breaks that silently.
if grep -rqE 'https?://(localhost|[0-9]{1,3}(\.[0-9]{1,3}){3})' "$DIST"/assets/*.js 2>/dev/null; then
  warn "the bundle contains a hard-coded host — it should only use relative paths"
  ask "Deploy anyway?" || die "Nothing changed."
else
  good "no hard-coded hosts in the bundle"
fi

# ── 4. Deploy ────────────────────────────────────────────────────────────
step "4. Deploying"

# Normally nothing to do. Only the first deploy needs root, and `ssh -t` gives
# sudo the terminal it requires — without one it cannot prompt at all.
if ssh "${SSH_OPTS[@]}" "$TARGET" "test -w '$WEB_DIR'" 2>/dev/null; then
  have "$WEB_DIR exists and is writable"
else
  info "$WEB_DIR is missing or not writable; creating it needs sudo there."
  ask "Create it now?" || die "Nothing changed."
  ssh "${SSH_OPTS[@]}" -t "$TARGET" \
    "sudo mkdir -p '$WEB_DIR' && sudo chown -R \$(id -u):\$(id -g) '$WEB_DIR'" \
    || die "Could not prepare $WEB_DIR."
  good "created $WEB_DIR"
fi

ask "rsync $DIST/ → $TARGET:$WEB_DIR/ (removes files no longer in the build)?" \
  || die "Nothing changed."

RSH="ssh ${SSH_OPTS[*]}"
# --delete is safe: this directory holds only build output, and Vite's
# content-hashed filenames would otherwise accumulate forever.
rsync -ah --delete --progress -e "$RSH" "$DIST/" "$TARGET:$WEB_DIR/" || die "rsync failed."
good "deployed"

# ── 5. Verify ────────────────────────────────────────────────────────────
step "5. Verifying"
for SCHEME in https http; do
  CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$SCHEME://$NYX_HOST/" 2>/dev/null || echo 000)"
  [[ "$CODE" != "000" ]] && break
done

case "$CODE" in
  2*) good "$SCHEME://$NYX_HOST/ returned $CODE" ;;
  000) warn "no HTTP response. Is the stack up?"
       info "  ssh $TARGET 'cd ~/nyx-audio/infra && docker compose ps'" ;;
  *)  warn "$SCHEME://$NYX_HOST/ returned $CODE"
      info "  ssh $TARGET 'cd ~/nyx-audio/infra && docker compose restart caddy'" ;;
esac

# A stale Caddy config serves the library server's own UI at / and returns a
# perfectly healthy 200. Only the title distinguishes the two.
TITLE="$(curl -sS --max-time 10 "$SCHEME://$NYX_HOST/" 2>/dev/null | grep -o '<title>[^<]*' | sed 's/<title>//')"
if [[ "$TITLE" == "Nyx Audio" ]]; then
  good "serving the Nyx client"
else
  warn "unexpected page title: '${TITLE:-none}'"
  info "Caddy may still be serving Navidrome at / — restart it (command above)."
fi

printf '\n%s▚ Done.%s\n' "$BOLD" "$OFF"
info "Client:          $SCHEME://$NYX_HOST/"
info "Navidrome admin: $SCHEME://$NYX_HOST/app/"
printf '\n'
