"""Import tests.

Filename handling gets the most attention here because it is the security
boundary: those names come from a browser and are used to build paths.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from nyx_api import db, importer
from nyx_api.importer import RejectedUpload


@pytest.fixture
def conn(tmp_path):
    c = db.connect(tmp_path / "nyx.db")
    c.executescript(importer.SCHEMA)
    c.commit()
    yield c
    c.close()


class TestSafeFilename:
    def test_keeps_an_ordinary_name(self):
        assert importer.safe_filename("01 Allah Hoo.flac") == "01 Allah Hoo.flac"

    def test_preserves_diacritics(self):
        # asciify_paths is deliberately off in the beets config; mangling
        # names here would be inconsistent and lossy.
        assert importer.safe_filename("Cesária Évora.flac") == "Cesária Évora.flac"
        assert importer.safe_filename("Górecki — III.flac") == "Górecki — III.flac"

    @pytest.mark.parametrize(
        "attack",
        [
            "../../etc/passwd",
            "../../../srv/music/x.flac",
            "/etc/cron.d/evil",
            "..\\..\\windows\\system32\\x",
            "subdir/../../escape.flac",
        ],
    )
    def test_strips_path_traversal(self, attack):
        safe = importer.safe_filename(attack)
        assert "/" not in safe and "\\" not in safe
        assert not safe.startswith("..")

    def test_takes_the_basename_of_a_windows_path(self):
        # os.path.basename on Linux does not split backslashes, so this has
        # to be handled explicitly.
        assert importer.safe_filename(r"C:\Music\Album\02 Track.flac") == "02 Track.flac"

    def test_removes_control_characters(self):
        assert "\x00" not in importer.safe_filename("bad\x00name.flac")
        assert "\n" not in importer.safe_filename("two\nlines.flac")

    def test_rejects_names_that_reduce_to_nothing(self):
        for bad in ["", "...", "/", "../", "   "]:
            with pytest.raises(RejectedUpload):
                importer.safe_filename(bad)

    def test_truncates_absurd_names_but_keeps_the_extension(self):
        name = importer.safe_filename("x" * 500 + ".flac")
        assert len(name) <= 200
        assert name.endswith(".flac")

    def test_normalises_unicode(self):
        decomposed = "Cesa\u0301ria.flac"   # e + combining acute
        composed = "Ces\u00e1ria.flac"
        assert importer.safe_filename(decomposed) == importer.safe_filename(composed)


class TestValidation:
    @pytest.mark.parametrize("name", ["a.flac", "a.mp3", "a.M4A", "cover.jpg", "rip.log"])
    def test_accepts_music_and_sidecars(self, name):
        importer.check_extension(name)

    @pytest.mark.parametrize("name", ["a.exe", "a.sh", "a", "a.zip", "a.php"])
    def test_rejects_everything_else(self, name):
        with pytest.raises(RejectedUpload):
            importer.check_extension(name)

    def test_distinguishes_audio_from_sidecars(self):
        assert importer.is_audio("01.flac") is True
        assert importer.is_audio("cover.jpg") is False

    def test_size_limits(self):
        importer.check_size(50_000_000)
        with pytest.raises(RejectedUpload):
            importer.check_size(0)
        with pytest.raises(RejectedUpload):
            importer.check_size(importer.MAX_FILE_BYTES + 1)

    def test_allows_a_genuinely_large_hi_res_movement(self):
        # A 26-minute 24/192 track is over a gigabyte and is not an attack.
        importer.check_size(1_400_000_000)


class TestStagingPath:
    def test_resolves_inside_the_batch(self, tmp_path):
        (tmp_path / "abc").mkdir()
        p = importer.staging_path(tmp_path, "abc", "track.flac")
        assert p.parent.name == "abc"

    def test_refuses_to_escape(self, tmp_path):
        (tmp_path / "abc").mkdir()
        with pytest.raises(RejectedUpload):
            importer.staging_path(tmp_path, "abc", "../../escape.flac")


class TestBatchRecords:
    def test_lifecycle(self, conn):
        bid = importer.new_batch_id()
        importer.create_batch(conn, bid)
        importer.add_file(conn, bid, "01.flac", 40_000_000)
        importer.add_file(conn, bid, "02.flac", 38_000_000)

        batch = importer.get_batch(conn, bid)
        assert batch["status"] == "staging"
        assert len(batch["files"]) == 2

        importer.set_status(conn, bid, "imported", "2 files imported")
        batch = importer.get_batch(conn, bid)
        assert batch["status"] == "imported"
        assert batch["finished_at"] is not None

    def test_only_terminal_statuses_set_a_finish_time(self, conn):
        bid = importer.new_batch_id()
        importer.create_batch(conn, bid)
        importer.set_status(conn, bid, "running")
        assert importer.get_batch(conn, bid)["finished_at"] is None

    def test_rejects_an_unknown_status(self, conn):
        bid = importer.new_batch_id()
        importer.create_batch(conn, bid)
        with pytest.raises(ValueError):
            importer.set_status(conn, bid, "vibing")

    def test_missing_batch_is_none(self, conn):
        assert importer.get_batch(conn, "nope") is None

    def test_batch_ids_are_unguessable_and_unique(self):
        ids = {importer.new_batch_id() for _ in range(200)}
        assert len(ids) == 200
        assert all(len(i) == 16 for i in ids)

    def test_listing_aggregates_size_and_count(self, conn):
        bid = importer.new_batch_id()
        importer.create_batch(conn, bid)
        importer.add_file(conn, bid, "01.flac", 100)
        importer.add_file(conn, bid, "02.flac", 250)
        row = importer.list_batches(conn)[0]
        assert row["file_count"] == 2 and row["bytes"] == 350


class TestRunImport:
    def test_empty_batch_fails_cleanly(self, conn, tmp_path):
        bid = importer.new_batch_id()
        importer.create_batch(conn, bid)
        (tmp_path / "staging" / bid).mkdir(parents=True)
        result = importer.run_import(
            conn, bid, tmp_path / "staging", tmp_path / "quarantine",
            Path("/nonexistent.yaml"),
        )
        assert result["status"] == "failed"
        assert "nothing was uploaded" in importer.get_batch(conn, bid)["message"]

    def test_says_so_when_beets_is_absent(self, conn, tmp_path, monkeypatch):
        bid = importer.new_batch_id()
        importer.create_batch(conn, bid)
        staging = tmp_path / "staging" / bid
        staging.mkdir(parents=True)
        (staging / "01.flac").write_bytes(b"not really audio")
        importer.add_file(conn, bid, "01.flac", 16)

        def no_beets(*a, **k):
            raise FileNotFoundError("beet")

        monkeypatch.setattr(importer.subprocess, "run", no_beets)
        result = importer.run_import(
            conn, bid, tmp_path / "staging", tmp_path / "quarantine",
            Path("/cfg.yaml"),
        )
        assert result["status"] == "failed"
        assert "not installed" in importer.get_batch(conn, bid)["message"]

    def test_leftovers_are_quarantined_not_discarded(self, conn, tmp_path, monkeypatch):
        """Whatever beets would not commit to must survive somewhere visible.

        This is what makes unattended import safe: an ambiguous album is held
        for a decision rather than filed under a guess.
        """
        bid = importer.new_batch_id()
        importer.create_batch(conn, bid)
        staging = tmp_path / "staging" / bid
        staging.mkdir(parents=True)
        (staging / "unmatched.flac").write_bytes(b"x" * 32)
        importer.add_file(conn, bid, "unmatched.flac", 32)

        class Done:
            stdout, stderr, returncode = "Tagging A - B\nSkipping.\n", "", 0

        monkeypatch.setattr(importer.subprocess, "run", lambda *a, **k: Done())

        quarantine = tmp_path / "quarantine"
        result = importer.run_import(
            conn, bid, tmp_path / "staging", quarantine, Path("/cfg.yaml"),
        )

        assert result["quarantined"] == 1
        assert (quarantine / bid / "unmatched.flac").exists()
        assert importer.get_batch(conn, bid)["status"] == "partial"

    def test_a_clean_import_reports_imported(self, conn, tmp_path, monkeypatch):
        bid = importer.new_batch_id()
        importer.create_batch(conn, bid)
        staging = tmp_path / "staging" / bid
        staging.mkdir(parents=True)
        track = staging / "01.flac"
        track.write_bytes(b"x" * 32)
        importer.add_file(conn, bid, "01.flac", 32)

        class Done:
            stdout, stderr, returncode = "imported", "", 0

        def fake_run(*a, **k):
            track.unlink()  # beets moves accepted files out of staging
            return Done()

        monkeypatch.setattr(importer.subprocess, "run", fake_run)
        result = importer.run_import(
            conn, bid, tmp_path / "staging", tmp_path / "quarantine", Path("/cfg.yaml"),
        )
        assert result == {"status": "imported", "imported": 1, "quarantined": 0}

    def test_sidecars_alone_do_not_count_as_quarantined(self, conn, tmp_path, monkeypatch):
        # beets leaves cover art behind; that is not a failed match.
        bid = importer.new_batch_id()
        importer.create_batch(conn, bid)
        staging = tmp_path / "staging" / bid
        staging.mkdir(parents=True)
        (staging / "cover.jpg").write_bytes(b"x" * 8)
        importer.add_file(conn, bid, "cover.jpg", 8)

        class Done:
            stdout, stderr, returncode = "", "", 0

        monkeypatch.setattr(importer.subprocess, "run", lambda *a, **k: Done())
        result = importer.run_import(
            conn, bid, tmp_path / "staging", tmp_path / "quarantine", Path("/cfg.yaml"),
        )
        assert result["quarantined"] == 0


def test_quiet_flag_is_present():
    """Quiet mode is the design, not a convenience.

    Without -q, beets prompts on an ambiguous match and the import hangs
    forever waiting for input nobody can give it.
    """
    cmd = importer.beets_command(Path("/cfg.yaml"), Path("/staging/abc"))
    assert "-q" in cmd
    assert cmd[0] == "beet"


class TestRelativePaths:
    """Keeping the album folder is what lets beets recognise a release.

    Flattening a dropped folder turns a compilation into a pile of unrelated
    tracks, and MusicBrainz cannot match that.
    """

    def test_keeps_the_album_folder(self):
        assert importer.safe_relpath("The Rough Guide to Asia/01 Zulya.flac") == \
            "The Rough Guide to Asia/01 Zulya.flac"

    def test_caps_the_depth(self):
        # A deep drop must not build an arbitrary tree on the server.
        assert importer.safe_relpath("a/b/c/d/Album/02 Track.flac") == "Album/02 Track.flac"

    def test_a_bare_filename_still_works(self):
        assert importer.safe_relpath("01 Plain.flac") == "01 Plain.flac"

    @pytest.mark.parametrize("attack", [
        "../../etc/passwd/evil.flac",
        "../../../../../../root/.ssh/authorized_keys.flac",
        "Album/../../../escape.flac",
        "/absolute/Album/x.flac",
    ])
    def test_no_traversal_survives(self, attack, tmp_path):
        rel = importer.safe_relpath(attack)
        assert ".." not in rel.split("/")
        # And the resolved destination is still inside the batch.
        (tmp_path / "b").mkdir()
        assert importer.staging_path(tmp_path, "b", rel).is_relative_to(
            (tmp_path / "b").resolve())

    def test_preserves_diacritics_in_folders(self):
        assert importer.safe_relpath("Cesária Évora/01 Sodade.flac") == \
            "Cesária Évora/01 Sodade.flac"

    def test_windows_separators(self):
        assert importer.safe_relpath(r"Album\02 Track.flac") == "Album/02 Track.flac"

    def test_rejects_a_path_that_reduces_to_nothing(self):
        with pytest.raises(RejectedUpload):
            importer.safe_relpath("../..")


class TestQuarantineBookkeeping:
    def test_nested_leftovers_are_recorded_under_their_real_path(self, conn, tmp_path, monkeypatch):
        """Regression: uploads are stored as 'Album/01 Track.mp3', and the
        quarantine step matched on bare filenames. No row was marked
        quarantined, so every held file was then reported as imported and the
        review list came back empty.
        """
        bid = importer.new_batch_id()
        importer.create_batch(conn, bid)
        album = tmp_path / "staging" / bid / "1981 - Fresh Breeze"
        album.mkdir(parents=True)
        (album / "01 Itni Muddat.mp3").write_bytes(b"x" * 32)
        (album / "cover.jpg").write_bytes(b"y" * 8)
        importer.add_file(conn, bid, "1981 - Fresh Breeze/01 Itni Muddat.mp3", 32)
        importer.add_file(conn, bid, "1981 - Fresh Breeze/cover.jpg", 8)

        class Skipped:
            stdout, returncode = "Tagging A - B\nSkipping.\n", 0

        monkeypatch.setattr(importer.subprocess, "run", lambda *a, **k: Skipped())
        result = importer.run_import(
            conn, bid, tmp_path / "staging", tmp_path / "quarantine", Path("/c.yaml"))

        statuses = {f["name"]: f["status"] for f in importer.get_batch(conn, bid)["files"]}
        assert statuses["1981 - Fresh Breeze/01 Itni Muddat.mp3"] == "quarantined"
        assert result == {"status": "partial", "imported": 0, "quarantined": 1}
        # The album folder survives into quarantine, so it can be re-imported
        # as an album rather than as loose files.
        assert (tmp_path / "quarantine" / bid / "1981 - Fresh Breeze" / "01 Itni Muddat.mp3").exists()

    def test_cover_art_is_not_counted_as_an_imported_track(self, conn, tmp_path, monkeypatch):
        bid = importer.new_batch_id()
        importer.create_batch(conn, bid)
        album = tmp_path / "staging" / bid / "Album"
        album.mkdir(parents=True)
        (album / "01.flac").write_bytes(b"x")
        (album / "cover.jpg").write_bytes(b"y")
        importer.add_file(conn, bid, "Album/01.flac", 1)
        importer.add_file(conn, bid, "Album/cover.jpg", 1)

        class Held:
            stdout, returncode = "Tagging A - B\nSkipping.\n", 0

        monkeypatch.setattr(importer.subprocess, "run", lambda *a, **k: Held())
        result = importer.run_import(
            conn, bid, tmp_path / "staging", tmp_path / "quarantine", Path("/c.yaml"))
        assert result["imported"] == 0 and result["quarantined"] == 1


# Real beets 2.14 `-v` output, trimmed. Two albums: one weak match that is
# skipped, one strong match that is filed.
REAL_LOG = """\
Tagging Dilraj Kaur - Fresh Breeze: Ghazals to Caress You
Candidate: Dilraj Kaur - Fresh Breeze (7ff41911-28f6-4079-bf08-85f9a9e6e928) from MusicBrainz
Success. Distance: 0.45
Candidate: Tony Chen - Fresh Breeze (317990f7-3331-4813-893c-13c791d15f61) from MusicBrainz
Success. Distance: 0.78
Skipping.
** error loading plugin fetchart
Tagging Various Artists - Putumayo presents Music from the Tea Lands
Candidate: Various Artists - Putumayo Presents: Music From the Tea Lands (5db56475-7801-4bfc-9cb6-3f330c9a3746) from MusicBrainz
Success. Distance: 0.03
Candidate: Various Artists - Putumayo Presents: Music From the Wine Lands (67784dab-b80f-4782-a7c8-611d2998c02a) from MusicBrainz
Success. Distance: 0.54
"""


class TestSummarise:
    def test_reads_real_beets_output(self):
        weak, strong = importer.summarise(REAL_LOG)
        assert weak["decision"] == "held" and weak["similarity"] == 55.0
        assert weak["best_match"] == "Dilraj Kaur - Fresh Breeze"
        assert strong["decision"] == "imported" and strong["similarity"] == 97.0
        assert strong["best_match"] == "Various Artists - Putumayo Presents: Music From the Tea Lands"

    def test_takes_the_closest_candidate_not_the_first(self):
        log = ("Tagging A - B\nCandidate: Far\nSuccess. Distance: 0.60\n"
               "Candidate: Near\nSuccess. Distance: 0.10\n")
        assert importer.summarise(log)[0]["best_match"] == "Near"

    def test_an_album_with_no_candidates_is_held(self):
        album = importer.summarise("Tagging X - Y\nNo candidates found.\n")[0]
        assert album["decision"] == "held" and album["similarity"] is None

    def test_empty_or_missing_log(self):
        assert importer.summarise("") == []

    def test_noise_before_the_first_album_is_ignored(self):
        log = "fetchart: google: Disabling art source\nTagging A - B\nSkipping.\n"
        assert len(importer.summarise(log)) == 1


def test_beets_is_asked_to_explain_itself():
    """Without -v the log said only 'Skipping.', which is how a
    fingerprinting penalty went undiagnosed through several imports."""
    cmd = importer.beets_command(Path("/c.yaml"), Path("/s"))
    assert "-v" in cmd and "-q" in cmd


def test_the_automatic_config_does_not_fingerprint():
    """Measured on a real compilation: chroma moved it from distance 0.03
    (filed) to 0.13 (held). It belongs in the interactive config only."""
    import yaml

    cfg = yaml.safe_load((Path(__file__).parent.parent / "beets-pi.yaml").read_text())
    assert "chroma" not in cfg["plugins"].split()
    assert isinstance(cfg["fetchart"]["sources"], list)


class TestFailureIsNotAMatchingDecision:
    """Regression: a beets that never ran reported every file as 'held — no
    confident match', sending someone hunting for a tagging problem that did
    not exist."""

    PROMPT = ("Loading plugins: musicbrainz\n"
              "The database directory /x does not exist. Create it (Y/n)? "
              "error: stdin stream ended while input required\n")

    def test_a_beets_that_never_ran_is_reported_as_failed(self, conn, tmp_path, monkeypatch):
        bid = importer.new_batch_id()
        importer.create_batch(conn, bid)
        album = tmp_path / "staging" / bid / "Album"
        album.mkdir(parents=True)
        (album / "01.mp3").write_bytes(b"x")
        importer.add_file(conn, bid, "Album/01.mp3", 1)

        class NeverRan:
            stdout, returncode = TestFailureIsNotAMatchingDecision.PROMPT, 1

        monkeypatch.setattr(importer.subprocess, "run", lambda *a, **k: NeverRan())
        result = importer.run_import(
            conn, bid, tmp_path / "staging", tmp_path / "quarantine", Path("/c.yaml"))

        batch = importer.get_batch(conn, bid)
        assert result["status"] == "failed" and batch["status"] == "failed"
        assert "stdin stream ended" in batch["message"]
        assert "no confident match" not in batch["message"]
        # Nothing was quarantined: the files wait in staging for a retry.
        assert (album / "01.mp3").exists()
        assert not (tmp_path / "quarantine" / bid).exists()

    def test_beets_error_extracts_the_reason(self):
        assert importer.beets_error(self.PROMPT) == "stdin stream ended while input required"
        assert importer.beets_error("Tagging A - B\nSkipping.\n") is None

    def test_beets_is_never_left_waiting_for_input(self, conn, tmp_path, monkeypatch):
        bid = importer.new_batch_id()
        importer.create_batch(conn, bid)
        (tmp_path / "staging" / bid).mkdir(parents=True)
        (tmp_path / "staging" / bid / "01.mp3").write_bytes(b"x")
        seen = {}

        class Ok:
            stdout, returncode = "Tagging A - B\nSkipping.\n", 0

        def capture(*a, **k):
            seen.update(k)
            return Ok()

        monkeypatch.setattr(importer.subprocess, "run", capture)
        importer.run_import(conn, bid, tmp_path / "staging", tmp_path / "quarantine", Path("/c"))
        assert seen.get("stdin") is importer.subprocess.DEVNULL


class TestResolveHelpers:
    @pytest.mark.parametrize("pasted", [
        "5db56475-7801-4bfc-9cb6-3f330c9a3746",
        "https://musicbrainz.org/release/5db56475-7801-4bfc-9cb6-3f330c9a3746",
        "https://musicbrainz.org/release/5DB56475-7801-4BFC-9CB6-3F330C9A3746/",
        "  musicbrainz.org/release/5db56475-7801-4bfc-9cb6-3f330c9a3746?tab=x ",
    ])
    def test_release_id_from_whatever_gets_pasted(self, pasted):
        assert importer.release_id_from(pasted) == "5db56475-7801-4bfc-9cb6-3f330c9a3746"

    @pytest.mark.parametrize("junk", ["", "not an id", "https://musicbrainz.org/", "5db56475"])
    def test_rejects_anything_without_a_release_id(self, junk):
        with pytest.raises(RejectedUpload):
            importer.release_id_from(junk)

    def test_duplicate_is_detected_from_real_quiet_mode_output(self):
        # Verbatim from a beets 2.14 run where the FLAC edition was already filed.
        assert importer._DUPLICATE.search("found duplicates: [1]\ndefault action for duplicates: s")
        assert not importer._DUPLICATE.search("found duplicates: []")
        assert not importer._DUPLICATE.search("Tagging A - B\nSkipping.")

    def test_a_forced_choice_opens_both_gates(self, tmp_path):
        base = tmp_path / "b.yaml"
        base.write_text((Path(__file__).parent.parent / "beets-pi.yaml").read_text())
        cfg = importer.resolve_config(base, forced=True, keep_duplicate=False)
        assert cfg["match"]["strong_rec_thresh"] == 1.0
        assert set(cfg["match"]["max_rec"].values()) == {"strong"}
        assert cfg["import"]["duplicate_action"] == "skip"

    def test_keep_both_only_when_asked(self, tmp_path):
        base = tmp_path / "b.yaml"
        base.write_text((Path(__file__).parent.parent / "beets-pi.yaml").read_text())
        assert importer.resolve_config(base, forced=False, keep_duplicate=True)["import"]["duplicate_action"] == "keep"
        # "Keep my tags" does not lower the bar on anything beets decides.
        assert importer.resolve_config(base, forced=False, keep_duplicate=False)["match"]["strong_rec_thresh"] == 0.04

    def test_the_command_for_each_action(self):
        accept = importer.resolve_command(Path("/c"), Path("/q/A"), "accept", "abc")
        asis = importer.resolve_command(Path("/c"), Path("/q/A"), "asis", None)
        assert ["-S", "abc"] == accept[accept.index("-S"):accept.index("-S") + 2]
        assert "-A" in asis and "-S" not in asis

    def test_folder_must_stay_inside_the_batch(self, tmp_path):
        (tmp_path / "b1" / "Album").mkdir(parents=True)
        assert importer.quarantined_folder(tmp_path, "b1", "Album").name == "Album"
        for bad in ["../..", "/etc", "Album/../../.."]:
            with pytest.raises(RejectedUpload):
                importer.quarantined_folder(tmp_path, "b1", bad)

    def test_summary_carries_folder_and_candidate_ids(self):
        log = ("Tagging Ancient Future - Putumayo\n"
               "Candidate: VA - Tea Lands (5db56475-7801-4bfc-9cb6-3f330c9a3746) from MusicBrainz\n"
               "Success. Distance: 0.18\n"
               "Candidate: VA - Wine Lands (67784dab-b80f-4782-a7c8-611d2998c02a) from MusicBrainz\n"
               "Success. Distance: 0.66\n"
               "\x1b[1;34m/import/staging/b9/Putumayo Presents\x1b[39;49;00m \x1b[1;34m(6 items)\x1b[39;49;00m\n"
               "Skipping.\n")
        album = importer.summarise(log, "b9")[0]
        assert album["folder"] == "Putumayo Presents"          # colour codes stripped
        assert [c["id"][:8] for c in album["candidates"]] == ["5db56475", "67784dab"]
        assert album["candidates"][0]["similarity"] == 82.0


def test_a_resolution_does_not_duplicate_the_album(conn, tmp_path, monkeypatch):
    """Regression, seen in a browser: resolving appended beets' second run to
    the log, the summariser parsed both runs, and the album appeared twice."""
    bid = importer.new_batch_id()
    importer.create_batch(conn, bid)
    album = tmp_path / "staging" / bid / "Album"
    album.mkdir(parents=True)
    (album / "01.mp3").write_bytes(b"x")
    importer.add_file(conn, bid, "Album/01.mp3", 1)

    auto_log = (f"Tagging A - B\nCandidate: X (5db56475-7801-4bfc-9cb6-3f330c9a3746) from MusicBrainz\n"
                f"Success. Distance: 0.18\n/import/staging/{bid}/Album (1 items)\nSkipping.\n")

    class Auto:
        stdout, returncode = auto_log, 0

    monkeypatch.setattr(importer.subprocess, "run", lambda *a, **k: Auto())
    importer.run_import(conn, bid, tmp_path / "staging", tmp_path / "q", Path("/c"))
    assert len(importer.get_batch(conn, bid)["albums"]) == 1

    manual_log = (f"Tagging A - B\nCandidate: X (5db56475-7801-4bfc-9cb6-3f330c9a3746) from MusicBrainz\n"
                  f"Success. Distance: 0.18\n/q/{bid}/Album (1 items)\n")

    class Manual:
        stdout, returncode = manual_log, 0

    def filed(*a, **k):
        for p in (tmp_path / "q" / bid / "Album").glob("*.mp3"):
            p.unlink()                       # beets moved it into the library
        return Manual()

    monkeypatch.setattr(importer.subprocess, "run", filed)
    base = tmp_path / "b.yaml"
    base.write_text((Path(__file__).parent.parent / "beets-pi.yaml").read_text())
    out = importer.resolve(conn, bid, "Album", "accept", tmp_path / "q", base,
                           release_id="5db56475-7801-4bfc-9cb6-3f330c9a3746")

    batch = importer.get_batch(conn, bid)
    assert out["outcome"] == "filed"
    assert len(batch["albums"]) == 1
    assert batch["albums"][0]["resolution"]["outcome"] == "filed"
    assert batch["status"] == "imported"
    assert "resolved by hand" in batch["log"]     # both runs still readable
