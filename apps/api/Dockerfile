# Nyx API. Multi-arch; the Pi is arm64.
#
# Built on your workstation or in CI and pushed, never built on the Pi
# (docs/tech-stack.md D9).
FROM python:3.12-slim AS base

# uv resolves and installs far faster than pip, and the lockfile makes the
# Pi deployment reproducible.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# beets shells out to all of these:
#   ffmpeg      ReplayGain scanning
#   libchromaprint-tools  fpcalc, for acoustic fingerprinting
#   flac        the badfiles plugin uses it to detect corrupt files
#   imagemagick cover art resizing
# This roughly triples the image, which is the price of importing from a
# browser instead of an ssh session.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg libchromaprint-tools flac imagemagick \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so a source change does not re-resolve the world.
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-install-project --no-dev 2>/dev/null \
    || uv sync --no-install-project --no-dev

COPY src ./src
RUN uv sync --no-dev

# Configuration is written as root, BEFORE dropping privileges. COPY creates
# /config owned by root regardless of USER, so anything that writes into it
# must run first — the generation step below failed with EACCES when it ran
# after `USER 1000`. The app only ever reads these files.
COPY beets-pi.yaml /config/beets.yaml

# An interactive variant for resolving quarantine by hand, GENERATED from the
# automatic one rather than maintained beside it.
#
# It has to be a complete, standalone config: beets does not merge a second
# -c over the first, and its include: directive did not apply either. Passing
# two configs silently drops the first, which sends the library to beets'
# default path instead of /music — files land inside the container, invisible
# to Navidrome, and vanish on the next rebuild.
RUN /app/.venv/bin/python -c "\
import yaml; \
c = yaml.safe_load(open('/config/beets.yaml')); \
c['import'].update({'quiet': False, 'timid': False, 'duplicate_action': 'ask'}); \
yaml.safe_dump(c, open('/config/interactive.yaml', 'w'), sort_keys=False, allow_unicode=True)"


# Late in the file on purpose: a new commit invalidates only the layers after
# this, not the apt and dependency layers that make the build slow.

# Runs unprivileged; /data is a bind mount owned by the host user.
RUN useradd --create-home --uid 1000 nyx || true
USER 1000

ARG NYX_COMMIT=unknown
ENV NYX_COMMIT=$NYX_COMMIT

ENV PATH="/app/.venv/bin:$PATH" \
    NYX_DB=/data/nyx.db \
    NYX_IMPORT_DIR=/import \
    NYX_BEETS_CONFIG=/config/beets.yaml

EXPOSE 8000

# One worker: SQLite with WAL handles this workload comfortably, and several
# workers writing the same file buys nothing here.
CMD ["uvicorn", "nyx_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
