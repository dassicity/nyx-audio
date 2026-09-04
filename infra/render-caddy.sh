#!/usr/bin/env bash
# Regenerate the per-machine Caddy fragment from its template.
#
#   ./render-caddy.sh            # render, reload Caddy if it changed
#   ./render-caddy.sh --check    # report drift, change nothing (exit 1 if stale)
#
# Runs ON THE SERVER. Both setup-tailscale.sh and deploy-web.sh call it, so
# the generated file cannot drift from the template it came from.
#
# Why this exists: the tailnet site block is generated and gitignored (a
# tailnet name has no place in a public repo), while the LAN block is tracked
# and rsynced. Change the routing and only the tracked half updates — the
# tailnet keeps serving whatever it was built with, silently, until someone
# notices they get a different app depending on which address they used.
set -uo pipefail
cd "$(dirname "$0")"

CHECK=0
[[ "${1:-}" == "--check" ]] && CHECK=1

TEMPLATE=caddy/conf.d/tailscale.caddy.example
TARGET=caddy/conf.d/tailscale.caddy

BOLD=$'\033[1m'; DIM=$'\033[2m'; GRN=$'\033[32m'; YLW=$'\033[33m'; OFF=$'\033[0m'
good() { printf '   %s✓%s %s\n' "$GRN" "$OFF" "$*"; }
have() { printf '   %s·%s %s\n' "$DIM" "$OFF" "$*"; }
warn() { printf '   %s!%s %s\n' "$YLW" "$OFF" "$*"; }

# Server-side only. A workstation may well have the Tailscale CLI, and
# rendering there produces a fragment naming the WORKSTATION's tailnet host —
# which is silently wrong and would be rsynced to the server as fact.
if [[ "$(uname -s)" != "Linux" ]]; then
  have "not the server (this is $(uname -s)); nothing to render"
  exit 0
fi

[[ -f "$TEMPLATE" ]] || { warn "no $TEMPLATE — nothing to render"; exit 0; }

# No Tailscale on this machine is a normal state, not an error: the LAN block
# stands alone and Caddy treats an empty glob as fine.
command -v tailscale >/dev/null || { have "tailscale not installed; nothing to render"; exit 0; }

FQDN="$(tailscale status --json 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))" 2>/dev/null || true)"
[[ -n "$FQDN" ]] || { have "tailscale not connected; nothing to render"; exit 0; }

RENDERED="$(sed "s|{{FQDN}}|${FQDN}|g" "$TEMPLATE")"

CHANGED=1
if [[ -f "$TARGET" ]] && [[ "$RENDERED" == "$(cat "$TARGET")" ]]; then
  have "$(basename "$TARGET") matches the template"
  CHANGED=0
fi

if (( CHECK )) && (( ! CHANGED )); then
  exit 0
fi

if (( CHECK )); then
  warn "$(basename "$TARGET") is stale — the tailnet address will serve"
  warn "something different from the LAN address until it is regenerated."
  exit 1
fi

if (( CHANGED )); then
  mkdir -p "$(dirname "$TARGET")"
  printf '%s\n' "$RENDERED" > "$TARGET"
  good "regenerated $(basename "$TARGET") for $FQDN"
fi

# Always reconcile the running container, even when the file was already
# correct. A bind-mounted file changing does not make Caddy re-read it, so a
# correct file and a stale process look identical from the outside — which is
# exactly how the tailnet address kept serving the wrong application.
#
# `up -d` rather than `restart`: restart reloads config but cannot add a
# volume that was absent when the container was created, and this mount was
# added after the fact.
if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  if docker compose up -d caddy >/dev/null 2>&1; then
    good "caddy reconciled with the current config"
  else
    warn "could not reconcile caddy — run: docker compose up -d caddy"
  fi
fi
