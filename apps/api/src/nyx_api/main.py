"""Nyx API.

Owns everything Navidrome cannot model: the complete play-event log, the
enrichment cache, and later the wishlist.

The rule that keeps this clean (docs/tech-stack.md D2): this service never
touches audio bytes. Streams go from the browser through Caddy to Navidrome
directly, which is why its language could be chosen on ecosystem grounds
rather than performance ones.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, Query, Request

from . import db
from . import lyrics as lyrics_mod
from . import stats as stats_mod
from .models import Lyrics, PlayEvent, Stats

DB_PATH = Path(os.environ.get("NYX_DB", "/data/nyx.db"))

RANGE_DAYS: dict[str, int | None] = {
    "week": 7,
    "month": 30,
    "year": 365,
    "all": None,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = db.connect(DB_PATH)
    try:
        yield
    finally:
        app.state.db.close()


app = FastAPI(title="Nyx API", version="0.1.0", lifespan=lifespan)


@app.get("/api/health")
def health(request: Request) -> dict:
    conn = request.app.state.db
    count = conn.execute("SELECT COUNT(*) AS n FROM plays").fetchone()["n"]
    return {"ok": True, "plays": count, "db": str(DB_PATH)}


@app.post("/api/plays", status_code=201)
def record_play(event: PlayEvent, request: Request) -> dict:
    conn = request.app.state.db
    with db.transaction(conn):
        conn.execute(
            """INSERT INTO plays (
                track_id, album_id, title, artist, album, genre, duration,
                format, bit_depth, sample_rate, output_sample_rate, path,
                played_at, tz_offset_minutes
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                event.track_id,
                event.album_id,
                event.title,
                event.artist,
                event.album,
                event.genre,
                event.duration,
                event.format,
                event.bit_depth,
                event.sample_rate,
                event.output_sample_rate,
                event.path,
                event.played_at,
                event.tz_offset_minutes,
            ),
        )
    return {"recorded": True}


@app.get("/api/stats", response_model=Stats)
def get_stats(
    request: Request,
    range: str = Query(default="all", pattern="^(week|month|year|all)$"),
) -> dict:
    conn = request.app.state.db
    days = RANGE_DAYS[range]
    if days is None:
        rows = conn.execute("SELECT * FROM plays").fetchall()
    else:
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        rows = conn.execute(
            "SELECT * FROM plays WHERE played_at >= ?", (since,)
        ).fetchall()
    return stats_mod.build(rows)


@app.get("/api/lyrics", response_model=Lyrics)
async def get_lyrics(
    request: Request,
    title: str,
    artist: str,
    album: str = "",
    duration: int = 0,
) -> dict:
    return await lyrics_mod.fetch(request.app.state.db, title, artist, album, duration)
