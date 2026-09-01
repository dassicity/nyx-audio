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

WORKDIR /app

# Dependencies first, so a source change does not re-resolve the world.
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-install-project --no-dev 2>/dev/null \
    || uv sync --no-install-project --no-dev

COPY src ./src
RUN uv sync --no-dev

# Runs unprivileged; /data is a bind mount owned by the host user.
RUN useradd --create-home --uid 1000 nyx || true
USER 1000

ENV PATH="/app/.venv/bin:$PATH" \
    NYX_DB=/data/nyx.db

EXPOSE 8000

# One worker: SQLite with WAL handles this workload comfortably, and several
# workers writing the same file buys nothing here.
CMD ["uvicorn", "nyx_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
