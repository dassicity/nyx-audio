"""API contract.

These Pydantic models are the source of truth for the client's types — the
OpenAPI schema is generated from them, and the TypeScript is generated from
that, so the two cannot drift.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class PlayEvent(BaseModel):
    """One play, reported by the client when it crosses the scrobble threshold.

    Navidrome keeps a counter; this keeps the event. A counter can say an
    album has 23 plays. Only events can say *when*, which is what every
    statistic below actually needs.
    """

    track_id: str
    album_id: str | None = None
    title: str
    artist: str
    album: str
    genre: str | None = None
    duration: float = Field(ge=0, description="Track length in seconds")

    # What was actually heard, not what the file claims.
    format: str | None = None
    bit_depth: int | None = None
    sample_rate: int | None = None
    output_sample_rate: int | None = Field(
        default=None, description="What the browser's AudioContext ran at"
    )
    path: str | None = Field(default=None, description="'buffer' or 'stream'")

    played_at: str = Field(description="ISO 8601 UTC instant")
    tz_offset_minutes: int = Field(
        default=0,
        ge=-900,
        le=900,
        description="Local offset from UTC, so the listening clock reads in "
        "the listener's own hours rather than UTC",
    )


class Summary(BaseModel):
    plays: int
    seconds: float
    albums: int
    artists: int
    tracks: int
    streak_days: int
    new_albums: int


class ClockCell(BaseModel):
    weekday: int = Field(ge=0, le=6, description="0 = Monday")
    hour: int = Field(ge=0, le=23)
    plays: int


class FormatSlice(BaseModel):
    label: str
    seconds: float
    fraction: float


class Ranked(BaseModel):
    name: str
    plays: int
    seconds: float


class Stats(BaseModel):
    summary: Summary
    clock: list[ClockCell]
    formats: list[FormatSlice]
    top_artists: list[Ranked]
    top_albums: list[Ranked]


class Lyrics(BaseModel):
    kind: str = Field(description="synced | plain | instrumental | absent")
    lines: list[dict] | None = None
    text: str | None = None
    cached: bool = False
