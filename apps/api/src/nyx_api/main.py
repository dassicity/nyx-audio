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
import shutil
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import (
    BackgroundTasks, FastAPI, File, Form, HTTPException, Query, Request, UploadFile,
)

from . import db
from . import importer
from . import lyrics as lyrics_mod
from . import stats as stats_mod
from .models import Lyrics, PlayEvent, Stats

DB_PATH = Path(os.environ.get("NYX_DB", "/data/nyx.db"))

# Uploads land here, are handed to beets, and are deleted once accepted.
# Kept off the library volume so a half-finished upload is never scanned.
IMPORT_ROOT = Path(os.environ.get("NYX_IMPORT_DIR", "/import"))
STAGING_ROOT = IMPORT_ROOT / "staging"
QUARANTINE_ROOT = IMPORT_ROOT / "quarantine"
BEETS_CONFIG = Path(os.environ.get("NYX_BEETS_CONFIG", "/config/beets.yaml"))

RANGE_DAYS: dict[str, int | None] = {
    "week": 7,
    "month": 30,
    "year": 365,
    "all": None,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = db.connect(DB_PATH)
    app.state.db.executescript(importer.SCHEMA)
    app.state.db.commit()
    for directory in (STAGING_ROOT, QUARANTINE_ROOT):
        directory.mkdir(parents=True, exist_ok=True)
    try:
        yield
    finally:
        app.state.db.close()


app = FastAPI(title="Nyx API", version="0.1.0", lifespan=lifespan)


@app.get("/api/health")
def health(request: Request) -> dict:
    conn = request.app.state.db
    count = conn.execute("SELECT COUNT(*) AS n FROM plays").fetchone()["n"]
    return {
        "ok": True,
        "plays": count,
        "db": str(DB_PATH),
        # Deployment compares this against HEAD. An image built before this
        # existed reports "unknown", which correctly reads as stale.
        "commit": os.environ.get("NYX_COMMIT", "unknown"),
    }


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


# ── import ───────────────────────────────────────────────────────────────
#
# The browser creates a batch, uploads files into it, then starts it. Kept in
# three steps rather than one so a large upload reports progress honestly and
# a half-uploaded album is never handed to beets.


@app.post("/api/import/batches", status_code=201)
def create_batch(request: Request) -> dict:
    batch_id = importer.new_batch_id()
    importer.create_batch(request.app.state.db, batch_id)
    (STAGING_ROOT / batch_id).mkdir(parents=True, exist_ok=True)
    return {"id": batch_id}


@app.post("/api/import/batches/{batch_id}/files", status_code=201)
async def upload_file(
    batch_id: str,
    request: Request,
    file: UploadFile = File(...),
    relative_path: str = Form(default=""),
) -> dict:
    conn = request.app.state.db
    batch = importer.get_batch(conn, batch_id)
    if batch is None:
        raise HTTPException(404, "no such batch")
    if batch["status"] != "staging":
        raise HTTPException(409, "this batch has already been started")
    if len(batch["files"]) >= importer.MAX_BATCH_FILES:
        raise HTTPException(413, f"a batch holds at most {importer.MAX_BATCH_FILES} files")

    try:
        # Prefer the relative path: it carries the album folder, which is what
        # lets beets recognise a release rather than a pile of loose tracks.
        raw = relative_path or file.filename or ""
        name = importer.safe_relpath(raw)
        importer.check_extension(name)
        target = importer.staging_path(STAGING_ROOT, batch_id, name)
    except importer.RejectedUpload as exc:
        raise HTTPException(400, str(exc)) from exc

    # Streamed in chunks: an upload must never be held in memory on a 4 GB Pi.
    written = 0
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            written += len(chunk)
            if written > importer.MAX_FILE_BYTES:
                out.close()
                target.unlink(missing_ok=True)
                raise HTTPException(413, "file is larger than the limit")
            out.write(chunk)

    try:
        importer.check_size(written)
    except importer.RejectedUpload as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(400, str(exc)) from exc

    importer.add_file(conn, batch_id, name, written)
    return {"name": name, "bytes": written}


@app.post("/api/import/batches/{batch_id}/start", status_code=202)
def start_batch(batch_id: str, request: Request, tasks: BackgroundTasks) -> dict:
    conn = request.app.state.db
    batch = importer.get_batch(conn, batch_id)
    if batch is None:
        raise HTTPException(404, "no such batch")
    if batch["status"] != "staging":
        raise HTTPException(409, f"batch is already {batch['status']}")
    if not batch["files"]:
        raise HTTPException(400, "nothing was uploaded")

    importer.set_status(conn, batch_id, "queued")
    tasks.add_task(
        importer.run_import,
        conn, batch_id, STAGING_ROOT, QUARANTINE_ROOT, BEETS_CONFIG,
    )
    return {"started": True, "files": len(batch["files"])}


@app.get("/api/import/batches")
def list_batches(request: Request, limit: int = Query(default=25, ge=1, le=100)) -> list[dict]:
    return importer.list_batches(request.app.state.db, limit)


@app.get("/api/import/batches/{batch_id}")
def read_batch(batch_id: str, request: Request) -> dict:
    batch = importer.get_batch(request.app.state.db, batch_id)
    if batch is None:
        raise HTTPException(404, "no such batch")
    return batch


@app.delete("/api/import/batches/{batch_id}", status_code=204)
def discard_batch(batch_id: str, request: Request) -> None:
    """Abandon a batch that has not started, and remove what it staged."""
    conn = request.app.state.db
    batch = importer.get_batch(conn, batch_id)
    if batch is None:
        raise HTTPException(404, "no such batch")
    if batch["status"] in {"queued", "running"}:
        raise HTTPException(409, "cannot discard a batch that is being imported")

    shutil.rmtree(STAGING_ROOT / batch_id, ignore_errors=True)
    conn.execute("DELETE FROM import_files WHERE batch_id = ?", (batch_id,))
    conn.execute("DELETE FROM import_batches WHERE id = ?", (batch_id,))
    conn.commit()
