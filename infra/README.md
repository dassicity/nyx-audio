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
curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up
sudo tailscale cert "nyx.$(tailscale status --json | grep -o '[a-z0-9-]*\.ts\.net' | head -1)"
```

Move the pair into `caddy/certs/`, then uncomment the certs volume in
`compose.yml` and the HTTPS block in `caddy/Caddyfile`. Retrofitting HTTPS after
the client is built is worse than doing it now — v3's installable app and
offline caching both require a secure context.

## Operating notes

- **The music mount is read-only** (`/srv/music:/music:ro`). Deliberate: a bug
  must never be able to delete the library. Adding music means rsync, then a
  rescan from the Navidrome UI.
- **Pin the Navidrome image** after the first good boot:
  `docker inspect --format='{{index .RepoDigests 0}}' deluan/navidrome:latest`
- **`caddy-data` holds your certificates.** Don't delete that volume casually.
- **Back up `/srv/music`.** restic to a USB disk, nightly (D11). The code is in
  git and replaceable; the library is not.
