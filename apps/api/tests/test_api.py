"""Endpoint and cache tests against a real (temporary) database."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from nyx_api import db, lyrics


@pytest.fixture
def conn(tmp_path):
    connection = db.connect(tmp_path / "nyx.db")
    yield connection
    connection.close()


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("NYX_DB", str(tmp_path / "api.db"))
    import importlib

    from nyx_api import main

    importlib.reload(main)
    with TestClient(main.app) as c:
        yield c


def event(**over):
    payload = {
        "track_id": "t1",
        "album_id": "a1",
        "title": "Allah Hoo",
        "artist": "Nusrat Fateh Ali Khan",
        "album": "Shahen-shah",
        "duration": 300.0,
        "format": "FLAC",
        "bit_depth": 16,
        "sample_rate": 44100,
        "played_at": datetime.now(timezone.utc).isoformat(),
        "tz_offset_minutes": 330,
    }
    payload.update(over)
    return payload


class TestPlays:
    def test_records_and_counts(self, client):
        assert client.get("/api/health").json()["plays"] == 0
        assert client.post("/api/plays", json=event()).status_code == 201
        assert client.get("/api/health").json()["plays"] == 1

    def test_rejects_a_malformed_event(self, client):
        bad = event()
        del bad["title"]
        assert client.post("/api/plays", json=bad).status_code == 422

    def test_rejects_an_impossible_timezone(self, client):
        assert client.post(
            "/api/plays", json=event(tz_offset_minutes=5000)
        ).status_code == 422

    def test_accepts_a_play_with_no_format_metadata(self, client):
        # Older servers omit bit depth and sample rate; losing the play
        # entirely would be worse than losing the detail.
        assert client.post(
            "/api/plays",
            json=event(format=None, bit_depth=None, sample_rate=None),
        ).status_code == 201


class TestStats:
    def test_empty_library_returns_a_shape_not_an_error(self, client):
        body = client.get("/api/stats").json()
        assert body["summary"]["plays"] == 0
        assert body["clock"] == [] and body["formats"] == []

    def test_aggregates_what_was_recorded(self, client):
        client.post("/api/plays", json=event(track_id="a", duration=100))
        client.post("/api/plays", json=event(track_id="b", duration=200))
        body = client.get("/api/stats").json()
        assert body["summary"]["plays"] == 2
        assert body["summary"]["seconds"] == pytest.approx(300)

    def test_rejects_an_unknown_range(self, client):
        assert client.get("/api/stats", params={"range": "decade"}).status_code == 422

    @pytest.mark.parametrize("window", ["week", "month", "year", "all"])
    def test_every_range_is_accepted(self, client, window):
        assert client.get("/api/stats", params={"range": window}).status_code == 200


class TestLyricsCache:
    def test_round_trips(self, conn):
        key = lyrics.cache_key("Allah Hoo", "Nusrat", "Shahen-shah", 300)
        lyrics.write_cache(conn, key, "plain", {"text": "words"})
        hit = lyrics.read_cache(conn, key)
        assert hit == {"kind": "plain", "cached": True, "text": "words"}

    def test_key_includes_duration(self):
        # Two recordings of the same qawwali can differ by ten minutes and
        # have different words; they must not share a cache entry.
        a = lyrics.cache_key("Allah Hoo", "Nusrat", "Shahen-shah", 300)
        b = lyrics.cache_key("Allah Hoo", "Nusrat", "Shahen-shah", 1500)
        assert a != b

    def test_key_ignores_case_and_padding(self):
        assert lyrics.cache_key(" Allah Hoo ", "NUSRAT", "Shahen-shah", 300) == \
               lyrics.cache_key("allah hoo", "nusrat", "SHAHEN-SHAH", 300)

    def test_miss_returns_none(self, conn):
        assert lyrics.read_cache(conn, "nothing") is None

    @pytest.mark.asyncio
    async def test_a_404_is_cached_because_it_is_a_real_answer(self, conn, monkeypatch):
        calls = {"n": 0}

        class FakeResponse:
            status_code = 404

            def json(self):
                return {}

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def get(self, *a, **k):
                calls["n"] += 1
                return FakeResponse()

        monkeypatch.setattr(lyrics.httpx, "AsyncClient", lambda **k: FakeClient())

        first = await lyrics.fetch(conn, "T", "A", "Al", 100)
        second = await lyrics.fetch(conn, "T", "A", "Al", 100)

        assert first["kind"] == "absent" and second["kind"] == "absent"
        assert second["cached"] is True
        assert calls["n"] == 1, "a cached 404 must not hit the network again"

    @pytest.mark.asyncio
    async def test_a_network_failure_is_NOT_cached(self, conn, monkeypatch):
        """Being offline is not the same as having no lyrics.

        Caching a connection error would poison the entry permanently: the
        track would show 'no lyrics' forever, even once the Pi is back online.
        """
        class FailingClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def get(self, *a, **k):
                raise httpx.ConnectError("offline")

        monkeypatch.setattr(lyrics.httpx, "AsyncClient", lambda **k: FailingClient())

        result = await lyrics.fetch(conn, "T", "A", "Al", 100)
        assert result["kind"] == "absent"

        key = lyrics.cache_key("T", "A", "Al", 100)
        assert lyrics.read_cache(conn, key) is None, "offline must not be cached"


class TestLrcParsing:
    def test_matches_the_client_parser(self):
        lines = lyrics.parse_lrc("[00:12.50]first\n[00:20.00]second")
        assert lines == [
            {"time": 12.5, "text": "first"},
            {"time": 20.0, "text": "second"},
        ]

    def test_fraction_digits(self):
        assert lyrics.parse_lrc("[00:01.5]a")[0]["time"] == pytest.approx(1.5)
        assert lyrics.parse_lrc("[00:01.05]a")[0]["time"] == pytest.approx(1.05)
        assert lyrics.parse_lrc("[00:01.050]a")[0]["time"] == pytest.approx(1.05)

    def test_repeated_stamps_expand(self):
        lines = lyrics.parse_lrc("[00:10.00][01:20.00]chorus")
        assert [line["time"] for line in lines] == [10.0, 80.0]

    def test_metadata_tags_are_ignored(self):
        assert lyrics.parse_lrc("[ar:Nusrat]\n[00:03.00]real") == [
            {"time": 3.0, "text": "real"}
        ]

    def test_long_tracks_do_not_wrap(self):
        assert lyrics.parse_lrc("[26:04.00]late")[0]["time"] == pytest.approx(1564)


def test_schema_is_idempotent(tmp_path):
    path = tmp_path / "twice.db"
    db.connect(path).close()
    conn = db.connect(path)
    tables = {
        r["name"]
        for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    assert {"plays", "lyrics_cache"} <= tables
    conn.close()


def test_transaction_rolls_back(tmp_path):
    conn = db.connect(tmp_path / "rb.db")
    with pytest.raises(sqlite3.IntegrityError):
        with db.transaction(conn):
            conn.execute("INSERT INTO plays (track_id) VALUES ('x')")
    assert conn.execute("SELECT COUNT(*) AS n FROM plays").fetchone()["n"] == 0
    conn.close()
