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

## 7. Deploy the client

Everything runs on the server: Caddy serves the built client at `/` and
proxies the API to Navidrome on the same origin. One origin means no CORS, and
the client only ever calls relative paths — so the same bundle works over LAN
HTTP and over TLS without a rebuild.

From your **workstation** (the server builds nothing — D9):

```bash
./deploy-web.sh
```

On first run it asks for the host, login and target directory, offers to save
them to `infra/.deploy.env` (gitignored), and offers to generate and install
an ssh key so nothing prompts for a password again. After that it is one
command with no interaction beyond confirming the rsync.

Settings resolve as environment variables → `.deploy.env` → ask. So a one-off
deploy to a different machine needs no config file:

```bash
NYX_HOST=192.168.1.42 NYX_USER=pi ./deploy-web.sh
```

`--reconfigure` re-asks everything. `--yes` skips all prompts, for CI or a
`make deploy`.

After deploying:

| URL | What |
|---|---|
| `/` | the Nyx client |
| `/app/` | Navidrome's own UI, for admin — users, scans, transcoding |
| `/rest/` | the OpenSubsonic API |

Local development still runs Vite on your workstation against the server's
API (`pnpm --filter @nyx/web dev`); copy `apps/web/.env.local.example` to
`.env.local` and set `NYX_SERVER`. That proxy is development-only and never
reaches the build — `deploy-web.sh` checks the bundle for a hard-coded host
before deploying, because that failure would work locally and break in
production.

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
