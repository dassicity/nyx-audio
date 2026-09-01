"""SQLite storage.

Two things live here and nowhere else: the complete play-event log, and a
cache of enrichment fetched from the internet. Neither can be reconstructed
later — the log because events are gone once unrecorded, the cache because
the Pi may have no internet when it is next asked.
"""
from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS plays (
    id                 INTEGER PRIMARY KEY,
    track_id           TEXT    NOT NULL,
    album_id           TEXT,
    title              TEXT    NOT NULL,
    artist             TEXT    NOT NULL,
    album              TEXT    NOT NULL,
    genre              TEXT,
    duration           REAL    NOT NULL,
    format             TEXT,
    bit_depth          INTEGER,
    sample_rate        INTEGER,
    output_sample_rate INTEGER,
    path               TEXT,
    played_at          TEXT    NOT NULL,
    tz_offset_minutes  INTEGER NOT NULL DEFAULT 0
);

-- Every statistic is a time range, so this index carries the whole workload.
CREATE INDEX IF NOT EXISTS plays_played_at ON plays(played_at);
CREATE INDEX IF NOT EXISTS plays_album     ON plays(album_id);

CREATE TABLE IF NOT EXISTS lyrics_cache (
    key        TEXT PRIMARY KEY,
    kind       TEXT NOT NULL,
    payload    TEXT,
    fetched_at TEXT NOT NULL
);
"""


def connect(path: Path | str) -> sqlite3.Connection:
    path = Path(path)
    if path.name != ":memory:":
        path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # WAL keeps a read during a write from blocking, which matters when the
    # dashboard is open while a track finishes.
    if path.name != ":memory:":
        conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
