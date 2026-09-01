"""Aggregation tests.

These run over dictionaries rather than a database, because the interesting
parts are the awkward ones: local-time bucketing across a UTC boundary,
streaks, and weighting by listening time rather than play count.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from nyx_api import stats

NOW = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)


def play(**over):
    row = {
        "track_id": "t1",
        "album_id": "a1",
        "title": "Allah Hoo",
        "artist": "Nusrat Fateh Ali Khan",
        "album": "Shahen-shah",
        "genre": "Qawwali",
        "duration": 300.0,
        "format": "FLAC",
        "bit_depth": 16,
        "sample_rate": 44100,
        "output_sample_rate": 44100,
        "path": "buffer",
        "played_at": NOW.isoformat(),
        "tz_offset_minutes": 0,
    }
    row.update(over)
    return row


def days_ago(n: int, hour: int = 12) -> str:
    return (NOW - timedelta(days=n)).replace(hour=hour).isoformat()


class TestSummary:
    def test_counts_distinct_things(self):
        s = stats.summary([
            play(track_id="a", album_id="x", artist="A"),
            play(track_id="b", album_id="x", artist="A"),
            play(track_id="c", album_id="y", artist="B"),
        ])
        assert s["plays"] == 3
        assert s["tracks"] == 3
        assert s["albums"] == 2
        assert s["artists"] == 2

    def test_sums_listening_time(self):
        s = stats.summary([play(duration=100), play(duration=250.5)])
        assert s["seconds"] == pytest.approx(350.5)

    def test_empty(self):
        s = stats.summary([])
        assert s["plays"] == 0 and s["albums"] == 0 and s["streak_days"] == 0


class TestStreak:
    def test_counts_consecutive_days(self):
        rows = [play(played_at=days_ago(n)) for n in (0, 1, 2)]
        assert stats.streak_days(rows) == 3

    def test_stops_at_a_gap(self):
        rows = [play(played_at=days_ago(n)) for n in (0, 1, 3, 4)]
        assert stats.streak_days(rows) == 2

    def test_several_plays_in_one_day_count_once(self):
        rows = [play(played_at=days_ago(0, hour=h)) for h in (9, 14, 22)]
        assert stats.streak_days(rows) == 1

    def test_empty(self):
        assert stats.streak_days([]) == 0


class TestClock:
    def test_buckets_by_local_weekday_and_hour(self):
        # 2026-09-01 is a Tuesday, so weekday 1.
        cells = stats.clock([play(played_at=NOW.isoformat())])
        assert cells == [{"weekday": 1, "hour": 12, "plays": 1}]

    def test_uses_local_time_not_utc(self):
        """A play at 22:00 local must land at hour 22, not at UTC's hour.

        Listening at 22:00 is a statement about someone's evening. Bucketing
        in UTC would move every Indian evening into the following morning.
        """
        late = datetime(2026, 9, 1, 16, 30, tzinfo=timezone.utc)  # 22:00 at +05:30
        cells = stats.clock([
            play(played_at=late.isoformat(), tz_offset_minutes=330)
        ])
        assert cells[0]["hour"] == 22

    def test_local_offset_can_push_into_the_next_day(self):
        # 20:00 UTC at +05:30 is 01:30 the following day, a Wednesday.
        evening = datetime(2026, 9, 1, 20, 0, tzinfo=timezone.utc)
        cells = stats.clock([
            play(played_at=evening.isoformat(), tz_offset_minutes=330)
        ])
        assert cells[0] == {"weekday": 2, "hour": 1, "plays": 1}

    def test_accepts_a_trailing_z(self):
        cells = stats.clock([play(played_at="2026-09-01T12:00:00Z")])
        assert cells[0]["hour"] == 12


class TestFormats:
    def test_labels_carry_real_numbers(self):
        out = stats.formats([play(format="FLAC", bit_depth=24, sample_rate=96000)])
        assert out[0]["label"] == "FLAC · 24 bit · 96 kHz"

    def test_weights_by_time_not_play_count(self):
        """One long hi-res movement outweighs several short lossy tracks.

        Counting plays would say this library is 75% MP3; by time it is not,
        and time is what was actually heard.
        """
        rows = [
            play(format="MP3", bit_depth=None, sample_rate=44100, duration=180),
            play(format="MP3", bit_depth=None, sample_rate=44100, duration=180),
            play(format="MP3", bit_depth=None, sample_rate=44100, duration=180),
            play(format="FLAC", bit_depth=24, sample_rate=96000, duration=1560),
        ]
        out = stats.formats(rows)
        assert out[0]["label"].startswith("FLAC")
        assert out[0]["fraction"] > 0.7

    def test_fractions_sum_to_one(self):
        rows = [play(format="FLAC"), play(format="MP3", bit_depth=None)]
        assert sum(f["fraction"] for f in stats.formats(rows)) == pytest.approx(1.0)

    def test_missing_metadata_does_not_crash(self):
        out = stats.formats([play(format=None, bit_depth=None, sample_rate=None)])
        assert out[0]["label"] == "UNKNOWN"

    def test_empty(self):
        assert stats.formats([]) == []


class TestRanked:
    def test_orders_by_plays_then_name(self):
        rows = [play(artist="B"), play(artist="A"), play(artist="A")]
        out = stats.ranked(rows, "artist")
        assert [r["name"] for r in out] == ["A", "B"]
        assert out[0]["plays"] == 2

    def test_respects_the_limit(self):
        rows = [play(artist=f"A{i}") for i in range(20)]
        assert len(stats.ranked(rows, "artist", limit=5)) == 5


def test_build_returns_every_section():
    out = stats.build([play()])
    assert set(out) == {"summary", "clock", "formats", "top_artists", "top_albums"}
