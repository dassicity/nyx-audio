# Deploying Nyx Audio on the Pi

Raspberry Pi OS Lite 64-bit, headless, on Ethernet. Nothing here is built on the
Pi — Navidrome and Caddy come from upstream images.

## 1. Prepare the Pi

Compose v2 (`docker compose`, with a space) is published by Docker, **not** by
Debian — `apt install docker-compose-plugin` fails on a stock Pi OS. Add
Docker's repository first.

```bash
sudo apt update && sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

`arch=arm64` is required — 64-bit Pi OS enables armhf multiarch, and without
the constraint apt looks for an armhf release that Docker does not publish.

```bash
echo "deb [arch=arm64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin rsync
```

```bash
sudo usermod -aG docker "$USER"   # log out and back in for this to take effect
sudo hostnamectl set-hostname nyx
docker compose version            # confirms the plugin, not the v1 script
```

`nyx.local` resolves over mDNS, which Raspberry Pi OS has by default.

## 2. Create the library directory

Outside the repo, and owned by you so the container's `PUID`/`PGID` match.

```bash
sudo mkdir -p /srv/music && sudo chown -R "$USER:$USER" /srv/music
```

## 3. Copy the library from your laptop

9.1 GB, so it fits the 64 GB card comfortably. Run this **on the laptop**:

```bash
rsync -ah --progress --exclude 'beets.db*' --exclude '.DS_Store' ~/nyx-library/ nil@nyx.local:/srv/music/
```

The trailing slash on the source matters — it copies the *contents*, not the
folder. No `--delete` on the first run.

macOS ships `openrsync`, which has no `--info=progress2`; `--progress` is the
portable equivalent. `brew install rsync` gets the GNU version if you want the
single-line total instead of ~4,400 filenames.

The beets database stays on the laptop. That is where the library is curated;
the Pi only ever sees finished files.

## 4. Start it

```bash
cd ~/nyx-audio/infra && cp .env.example .env
```

Set `PUID`/`PGID` from `id -u` and `id -g`, then:

```bash
docker compose up -d && docker compose logs -f navidrome
```

The first scan takes a couple of minutes. Watch for the track count.

## 5. Verify

Open `http://nyx.local` and create the admin account on first visit.

You are looking for **31 albums / 267 tracks** — 269 once Mehfil-e-Sama is
imported. If the count is short, the usual causes are a permissions mismatch
(`PUID`/`PGID` not matching the owner of `/srv/music`) or an interrupted rsync.

Check the API directly, which is what the client will use:

```bash
curl -s 'http://nyx.local/rest/ping.view?u=USER&p=PASS&v=1.16.1&c=nyx&f=json'
```

Then point any Subsonic client on your phone at `http://nyx.local` and play
something. **That is the milestone** — from here you are never blocked on
unfinished UI to listen to your own library.

## 6. Tailscale — do this in v1, not later

```bash
./setup-tailscale.sh
```

Idempotent and re-runnable. It reports what it finds at each step, confirms
before anything that needs a decision, installs Tailscale if absent, works out
this machine's tailnet name, obtains the certificate, writes the Caddy site
block, restarts the stack and verifies the result.

One prerequisite it cannot do for you: **HTTPS must be enabled for your
tailnet** (admin console → DNS → HTTPS Certificates). The script tells you so
if the certificate request fails.

Everything it produces is machine-specific and gitignored — `caddy/certs/` and
`caddy/conf.d/tailscale.caddy`. A tailnet name identifies your network and has
no place in a public repo, which is why the Caddyfile imports a generated
fragment instead of naming a host. A machine without Tailscale matches no
files in that glob, which Caddy treats as fine, and serves plain HTTP.

Re-run the script to renew — Tailscale certificates last 90 days, and it skips
the work unless expiry is within three weeks.

Do this before building the client, not after. It is not about remote access:
v3's installable app and offline caching both require a secure context, and no
public CA will issue a certificate for a private IP.

---

## 7. Deploying

Everything runs on the server: Caddy serves the built client at `/`, proxies
`/rest` to Navidrome and `/api` to nyx-api. One origin, so no CORS, and the
client only ever calls relative paths.

### From git, on the server

Once, so the server can build the client itself:

```bash
cd ~/nyx-audio/infra && ./setup-node.sh
```

Then, every time:

```bash
cd ~/nyx-audio/infra && ./deploy.sh
```

It asks the running client (`/version.json`) and API (`/api/health`) which
commit they were built from, rebuilds whichever is behind HEAD, fixes
directory ownership, reconciles Caddy, and verifies. It exits non-zero and
lists what is wrong if anything is left stale — it will not print "Done" over
an old build.

It does not matter whether you `git pull` first. An earlier version decided
what to rebuild from what that particular run had pulled, so pulling first
rebuilt nothing and then reported success. Asking the running services removes
that whole class of mistake. The build is also shown in Settings → About.

This needs no exclude list, because **everything machine-specific is
gitignored** — `.env`, `caddy/certs/`, `caddy/conf.d/tailscale.caddy`,
`.deploy.env`. A pull cannot overwrite this machine's own configuration.

It refuses to pull over a dirty working tree without asking, since merging
silently over an edit made on the server is how you lose a fix nobody wrote
down.

### The one thing git does not carry

`apps/web/dist` is build output and does not belong in a repository. Two ways
to get it onto the server:

- **`deploy.sh` builds it there**, if `pnpm` is installed. Slower than a
  workstation, but keeps deployment to a single command.
- **`deploy-web.sh` sends it from your workstation** — the D9 answer, and
  what to use if you would rather not put a JS toolchain on the Pi.

Either works; `deploy.sh` detects which applies and says so.

### Where things are served

| URL | What |
|---|---|
| `/` | the Nyx client |
| `/app/` | Navidrome's own UI, for admin — users, scans, transcoding |
| `/rest/` | the OpenSubsonic API |
| `/api/` | nyx-api — play history, statistics, lyrics cache, imports |

---

## Resolving quarantine by hand

Files beets would not match confidently are held at
`$DATA_DIR/import/quarantine/<batch-id>` rather than filed under a guess. To
make the call yourself:

```bash
docker compose exec -it nyx-api beet -c /config/interactive.yaml import /import/quarantine/<batch-id>
```

**One `-c`, and it must be `interactive.yaml`.** beets does not merge a second
`-c` over the first, and its `include:` directive did not apply either —
passing two configs silently drops the first, which sends the library to
beets' default path. Files then land inside the container, invisible to
Navidrome, and disappear on the next rebuild. `interactive.yaml` is generated
from `beets.yaml` at image build time precisely so it is complete on its own.

Afterwards, trigger a rescan — from the Import screen, or:

```bash
curl "http://localhost/rest/startScan.view?u=USER&p=PASS&v=1.16.1&c=nyx&f=json"
```

Navidrome only notices new files when it scans. Nothing appears in the Albums
pane until then, however correctly beets filed it.

---

## Operating notes

- **The music mount is read-only** (`/srv/music:/music:ro`). Deliberate: a bug
  must never be able to delete the library. Adding music means rsync, then a
  rescan from the Navidrome UI.
- **Pin the Navidrome image** after the first good boot:
  `docker inspect --format='{{index .RepoDigests 0}}' deluan/navidrome:latest`
- **`caddy-data` holds your certificates.** Don't delete that volume casually.
- **Back up `/srv/music`.** restic to a USB disk, nightly (D11). The code is in
  git and replaceable; the library is not.
