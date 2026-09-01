"""LRCLIB proxy and cache.

The client currently fetches lyrics straight from the browser, which means
nothing is remembered between sessions and an offline Pi serves nothing.
Caching here fixes both: once seen, a lyric is served from disk forever.
"""
from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime, timezone

import httpx

LRCLIB = "https://lrclib.net/api/get"
TIMEOUT = httpx.Timeout(6.0, connect=3.0)

_STAMP = re.compile(r"\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]")


def cache_key(title: str, artist: str, album: str, duration: int) -> str:
    # Duration is part of the key because lrclib matches on it: two recordings
    # of the same qawwali can differ by ten minutes and have different words.
    # The separator matters: joining with nothing lets ("ab", "c") collide
    # with ("a", "bc").
    return " :: ".join(
        [
            title.strip().lower(),
            artist.strip().lower(),
            album.strip().lower(),
            str(duration),
        ]
    )


def read_cache(conn: sqlite3.Connection, key: str) -> dict | None:
    row = conn.execute(
        "SELECT kind, payload FROM lyrics_cache WHERE key = ?", (key,)
    ).fetchone()
    if row is None:
        return None
    result: dict = {"kind": row["kind"], "cached": True}
    if row["payload"]:
        result.update(json.loads(row["payload"]))
    return result


def write_cache(conn: sqlite3.Connection, key: str, kind: str, payload: dict) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO lyrics_cache (key, kind, payload, fetched_at) "
        "VALUES (?, ?, ?, ?)",
        (
            key,
            kind,
            json.dumps(payload) if payload else None,
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    conn.commit()


def parse_lrc(lrc: str) -> list[dict]:
    """Parse LRC into timed lines.

    Mirrors the client's parser deliberately: a line may carry several
    timestamps, fraction digits are one to three and mean different things,
    and metadata tags look like timestamps until checked.
    """
    out: list[dict] = []

    for raw in lrc.splitlines():
        times = []
        for m in _STAMP.finditer(raw):
            frac = m.group(3)
            seconds = (
                int(m.group(1)) * 60
                + int(m.group(2))
                + (int(frac) / 10 ** len(frac) if frac else 0)
            )
            times.append(seconds)
        if not times:
            continue
        text = _STAMP.sub("", raw).strip()
        out.extend({"time": t, "text": text} for t in times)

    return sorted(out, key=lambda line: line["time"])


async def fetch(
    conn: sqlite3.Connection, title: str, artist: str, album: str, duration: int
) -> dict:
    key = cache_key(title, artist, album, duration)
    hit = read_cache(conn, key)
    if hit is not None:
        return hit

    params = {
        "track_name": title,
        "artist_name": artist,
        "album_name": album,
        "duration": duration,
    }
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(LRCLIB, params=params)
    except httpx.HTTPError:
        # Offline. Do NOT cache this: absence of internet is not absence of
        # lyrics, and caching it would poison the entry permanently.
        return {"kind": "absent", "cached": False}

    if response.status_code == 404:
        # A real answer, worth caching: nobody has transcribed this.
        write_cache(conn, key, "absent", {})
        return {"kind": "absent", "cached": False}

    if response.status_code != 200:
        return {"kind": "absent", "cached": False}

    data = response.json()

    if data.get("instrumental"):
        write_cache(conn, key, "instrumental", {})
        return {"kind": "instrumental", "cached": False}

    synced = data.get("syncedLyrics")
    if synced:
        lines = parse_lrc(synced)
        if lines:
            write_cache(conn, key, "synced", {"lines": lines})
            return {"kind": "synced", "lines": lines, "cached": False}

    plain = data.get("plainLyrics")
    if plain and plain.strip():
        write_cache(conn, key, "plain", {"text": plain})
        return {"kind": "plain", "text": plain, "cached": False}

    write_cache(conn, key, "absent", {})
    return {"kind": "absent", "cached": False}
