#!/usr/bin/env bash
# Nyx Audio — set up Tailscale + HTTPS on this machine.
#
#   ./setup-tailscale.sh          # walk through it, confirming each step
#   ./setup-tailscale.sh --yes    # assume yes to every confirmation
#
# Idempotent: safe to re-run. Every step reports what it found before it acts,
# and says "already done" rather than redoing work. Nothing here is
# destructive except overwriting an expiring certificate, which it asks about.
#
# Produces two things, both gitignored, both specific to this machine:
#   caddy/certs/<fqdn>.{crt,key}    the TLS pair, from Tailscale
#   caddy/conf.d/tailscale.caddy    the Caddy site block for this host
#
# The tailnet name identifies your network, so it is generated here rather
# than committed to a public repo.
set -uo pipefail
cd "$(dirname "$0")"

ASSUME_YES=0
[[ "${1:-}" == "--yes" ]] && ASSUME_YES=1

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; OFF=$'\033[0m'

step() { printf '\n%s▚ %s%s\n' "$BOLD" "$*" "$OFF"; }
info() { printf '   %s\n' "$*"; }
good() { printf '   %s✓%s %s\n' "$GRN" "$OFF" "$*"; }
have() { printf '   %s·%s already done: %s\n' "$DIM" "$OFF" "$*"; }
warn() { printf '   %s!%s %s\n' "$YLW" "$OFF" "$*"; }
die()  { printf '\n   %s✗ %s%s\n\n' "$RED" "$*" "$OFF" >&2; exit 1; }

ask() {
  (( ASSUME_YES )) && { info "$1 — assuming yes"; return 0; }
  local reply
  read -r -p "   $1 [y/N] " reply
  [[ "$reply" =~ ^[Yy] ]]
}

# ── 1. Preflight ─────────────────────────────────────────────────────────
step "1. Checking this machine"

[[ "$(uname -s)" == "Linux" ]] || die "This runs on the Pi, not on macOS. ssh in first."
[[ -f compose.yml ]] || die "Run this from infra/. Expected compose.yml here."
command -v python3 >/dev/null || die "python3 is needed to read Tailscale's status."

if . /etc/os-release 2>/dev/null; then
  info "os: ${PRETTY_NAME:-unknown} (${VERSION_CODENAME:-?})"
fi
if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  good "docker compose: $(docker compose version --short 2>/dev/null || echo present)"
else
  warn "docker compose not found — the stack cannot be restarted at the end"
fi

# ── 2. Install Tailscale ─────────────────────────────────────────────────
step "2. Tailscale"

if command -v tailscale >/dev/null; then
  have "tailscale installed ($(tailscale version | head -1))"
else
  CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME:-bookworm}")"
  info "not installed. Adding Tailscale's apt repository for '$CODENAME'."
  ask "Install tailscale now?" || die "Nothing changed."

  KEYRING=/usr/share/keyrings/tailscale-archive-keyring.gpg
  if ! curl -fsSL "https://pkgs.tailscale.com/stable/debian/${CODENAME}.noarmor.gpg" \
       | sudo tee "$KEYRING" >/dev/null; then
    warn "no packages for '$CODENAME'; falling back to bookworm (static Go binary, runs fine)"
    CODENAME=bookworm
    curl -fsSL "https://pkgs.tailscale.com/stable/debian/${CODENAME}.noarmor.gpg" \
      | sudo tee "$KEYRING" >/dev/null \
      || die "Could not fetch Tailscale's signing key. Check network access."
  fi
  curl -fsSL "https://pkgs.tailscale.com/stable/debian/${CODENAME}.tailscale-keyring.list" \
    | sudo tee /etc/apt/sources.list.d/tailscale.list >/dev/null
  sudo apt update -qq && sudo apt install -y tailscale || die "apt install tailscale failed."
  good "installed $(tailscale version | head -1)"
fi

# ── 3. Connect ───────────────────────────────────────────────────────────
step "3. Connecting to your tailnet"

BACKEND="$(tailscale status --json 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('BackendState','Unknown'))" 2>/dev/null || echo Unknown)"

if [[ "$BACKEND" == "Running" ]]; then
  have "already connected"
else
  info "state: $BACKEND"
  info "'tailscale up' will print a URL — open it in a browser to authorise."
  ask "Run 'sudo tailscale up' now?" || die "Nothing changed."
  sudo tailscale up || die "tailscale up failed."
fi

FQDN="$(tailscale status --json \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))" 2>/dev/null)"
[[ -n "$FQDN" ]] || die "Could not read this machine's tailnet name from 'tailscale status --json'."
good "this machine is: $FQDN"

# ── 4. Certificate ───────────────────────────────────────────────────────
step "4. TLS certificate"

mkdir -p caddy/certs
CRT="caddy/certs/${FQDN}.crt"
KEY="caddy/certs/${FQDN}.key"
NEED_CERT=1

if [[ -f "$CRT" && -f "$KEY" ]]; then
  if openssl x509 -checkend $((21*24*3600)) -noout -in "$CRT" >/dev/null 2>&1; then
    EXPIRY="$(openssl x509 -enddate -noout -in "$CRT" 2>/dev/null | cut -d= -f2)"
    have "certificate valid until $EXPIRY"
    NEED_CERT=0
  else
    warn "certificate expires within 21 days (or is unreadable)"
    ask "Renew it?" || NEED_CERT=0
  fi
fi

if (( NEED_CERT )); then
  info "Requesting a certificate from Tailscale."
  info "This needs HTTPS enabled for your tailnet:"
  info "  admin console → DNS → HTTPS Certificates → Enable"
  if ! sudo tailscale cert --cert-file "$CRT" --key-file "$KEY" "$FQDN"; then
    die "tailscale cert failed. The usual cause is HTTPS not being enabled for the tailnet (see the link above)."
  fi
  # Caddy runs as root inside its container and reads these read-only.
  sudo chmod 644 "$CRT" && sudo chmod 640 "$KEY"
  good "wrote $CRT and $KEY"
fi

# ── 5. Caddy site block ──────────────────────────────────────────────────
step "5. Caddy configuration"

TEMPLATE=caddy/conf.d/tailscale.caddy.example
TARGET=caddy/conf.d/tailscale.caddy
[[ -f "$TEMPLATE" ]] || die "Missing $TEMPLATE — is the repo complete?"

RENDERED="$(sed "s|{{FQDN}}|${FQDN}|g" "$TEMPLATE")"
if [[ -f "$TARGET" ]] && [[ "$RENDERED" == "$(cat "$TARGET")" ]]; then
  have "$TARGET is current"
else
  printf '%s\n' "$RENDERED" > "$TARGET"
  good "wrote $TARGET for $FQDN"
fi

# ── 6. Validate and restart ──────────────────────────────────────────────
step "6. Applying it"

if docker compose version >/dev/null 2>&1; then
  if docker compose config --quiet 2>/dev/null; then
    good "compose.yml is valid"
  else
    warn "compose.yml did not validate — check it before restarting"
  fi

  if ask "Restart the stack now?"; then
    docker compose up -d || die "docker compose up failed."
    sleep 3
    if docker compose logs --tail=40 caddy 2>&1 | grep -qiE 'error|failed to load'; then
      warn "Caddy logged an error — inspect with: docker compose logs caddy"
    else
      good "caddy restarted cleanly"
    fi
  else
    info "skipped. Apply later with: docker compose up -d"
  fi
else
  info "skipped — docker compose unavailable here."
fi

# ── 7. Verify ────────────────────────────────────────────────────────────
step "7. Verifying"

CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "https://${FQDN}/" 2>/dev/null || echo 000)"
case "$CODE" in
  000) warn "no HTTPS response yet. If the stack just started, give it a moment and retry:"
       info "  curl -sI https://${FQDN}/" ;;
  2*|3*) good "https://${FQDN}/ returned $CODE" ;;
  *)   warn "https://${FQDN}/ returned $CODE — check: docker compose logs caddy" ;;
esac

printf '\n%s▚ Done.%s\n' "$BOLD" "$OFF"
info "LAN:      http://$(hostname).local"
info "Tailnet:  https://${FQDN}"
info "Renew the certificate before it expires by re-running this script."
printf '\n'
