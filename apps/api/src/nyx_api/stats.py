"""Aggregations over the play log.

Written as pure functions over rows rather than SQL, so they can be tested
without a database and so the awkward parts — local-time bucketing, streaks
across timezone boundaries — are visible rather than buried in a query.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable


def _local(row: Any) -> datetime:
    """The moment of a play, in the listener's own local time.

    Events are stored as UTC instants plus the offset that was in force. A
    listening clock in UTC would be meaningless to a person — "I listen at
    22:00" is a statement about their evening, not about Greenwich.
    """
    played = datetime.fromisoformat(row["played_at"].replace("Z", "+00:00"))
    if played.tzinfo is None:
        played = played.replace(tzinfo=timezone.utc)
    return played.astimezone(timezone.utc) + timedelta(
        minutes=row["tz_offset_minutes"] or 0
    )


def summary(rows: Iterable[Any]) -> dict[str, Any]:
    rows = list(rows)
    albums = {r["album_id"] or r["album"] for r in rows}
    return {
        "plays": len(rows),
        "seconds": sum(float(r["duration"]) for r in rows),
        "albums": len(albums),
        "artists": len({r["artist"] for r in rows}),
        "tracks": len({r["track_id"] for r in rows}),
        "streak_days": streak_days(rows),
        "new_albums": len(albums),
    }


def streak_days(rows: Iterable[Any]) -> int:
    """Consecutive days ending today or yesterday on which anything played.

    Yesterday counts as still-alive: a streak should not be declared broken at
    one minute past midnight, before the day has had a chance.
    """
    days = {_local(r).date() for r in rows}
    if not days:
        return 0

    today = max(days)
    run = 0
    cursor = today
    while cursor in days:
        run += 1
        cursor -= timedelta(days=1)
    return run


def clock(rows: Iterable[Any]) -> list[dict[str, int]]:
    """Hour-of-day by weekday, in local time. Monday is 0."""
    counts: dict[tuple[int, int], int] = defaultdict(int)
    for r in rows:
        t = _local(r)
        counts[(t.weekday(), t.hour)] += 1
    return [
        {"weekday": wd, "hour": hr, "plays": n}
        for (wd, hr), n in sorted(counts.items())
    ]


def format_label(row: Any) -> str:
    """How a listener would describe what they heard.

    Bit depth and sample rate are what distinguish a CD rip from a hi-res
    download, and this is the one statistic no streaming service can produce
    about your own listening.
    """
    fmt = (row["format"] or "unknown").upper()
    depth = row["bit_depth"]
    rate = row["sample_rate"]
    if depth and rate:
        return f"{fmt} · {depth} bit · {rate / 1000:g} kHz"
    if rate:
        return f"{fmt} · {rate / 1000:g} kHz"
    return fmt


def formats(rows: Iterable[Any]) -> list[dict[str, Any]]:
    """Share of listening TIME, not play count.

    Counting plays would make a library of three-minute songs look hi-res
    because of one long 24/96 movement, or the reverse. Time is what was
    actually heard.
    """
    seconds: dict[str, float] = defaultdict(float)
    for r in rows:
        seconds[format_label(r)] += float(r["duration"])

    total = sum(seconds.values())
    return [
        {"label": label, "seconds": s, "fraction": (s / total) if total else 0.0}
        for label, s in sorted(seconds.items(), key=lambda kv: -kv[1])
    ]


def ranked(rows: Iterable[Any], key: str, limit: int = 10) -> list[dict[str, Any]]:
    plays: dict[str, int] = defaultdict(int)
    seconds: dict[str, float] = defaultdict(float)
    for r in rows:
        name = r[key]
        plays[name] += 1
        seconds[name] += float(r["duration"])
    ordered = sorted(plays.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]
    return [{"name": n, "plays": p, "seconds": seconds[n]} for n, p in ordered]


def build(rows: Iterable[Any]) -> dict[str, Any]:
    rows = list(rows)
    return {
        "summary": summary(rows),
        "clock": clock(rows),
        "formats": formats(rows),
        "top_artists": ranked(rows, "artist"),
        "top_albums": ranked(rows, "album"),
    }
