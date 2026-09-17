"""Importing music uploaded from a browser.

The doctrine in docs/library-migration.md is that beets runs on the laptop,
because import is interactive and you make judgement calls on ambiguous
matches. This does not overturn that — it reconciles with it.

beets runs here in QUIET mode, which accepts only strong MusicBrainz matches
and refuses to guess. Anything it will not commit to goes to quarantine and is
shown in the interface, rather than being silently filed under a wrong name.
The doctrine's real point — that the Pi only ever holds clean files — survives.
"""
from __future__ import annotations

import re
import secrets
import shutil
import sqlite3
import subprocess
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

# Lossless first, but the existing library is 91% MP3 by playing time, so
# refusing lossy uploads would be a strange thing to enforce here.
AUDIO_EXTENSIONS = {
    ".flac", ".mp3", ".m4a", ".ogg", ".opus", ".wav", ".aiff", ".aif",
    ".ape", ".wv", ".alac",
}
SIDECAR_EXTENSIONS = {".jpg", ".jpeg", ".png", ".cue", ".log", ".txt", ".m3u"}
ALLOWED_EXTENSIONS = AUDIO_EXTENSIONS | SIDECAR_EXTENSIONS

MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024  # a 24/192 movement can be over 1 GB
MAX_BATCH_FILES = 500

_UNSAFE = re.compile(r'[\x00-\x1f\x7f<>:"|?*\\/]')


class RejectedUpload(ValueError):
    """A file we will not accept, with a reason worth showing the user."""


def new_batch_id() -> str:
    return secrets.token_hex(8)


def safe_relpath(raw: str, depth: int = 2) -> str:
    """Sanitise a browser-supplied relative path, keeping its folder.

    A dropped folder arrives as 'Album Name/01 Track.flac'. Keeping that
    structure matters: beets groups an album by directory, and the folder name
    is frequently the best hint about what the release is. Flattening
    everything into one directory turns a compilation into eleven unrelated
    files and MusicBrainz cannot match it.

    Depth is capped so a deeply nested drop cannot build an arbitrary tree.
    """
    normalised = raw.replace("\\", "/")
    parts = [p for p in normalised.split("/") if p not in ("", ".", "..")]
    if not parts:
        raise RejectedUpload("file has no usable name")

    name = safe_filename(parts[-1])

    # A genuine folder drop never contains '..' or a leading '/'. When one
    # does, keep the filename and discard the directories: the path is not
    # trustworthy enough to take naming advice from, even though
    # staging_path would confine it anyway.
    if ".." in normalised.split("/") or normalised.startswith("/"):
        return name
    folders = [safe_component(p) for p in parts[-depth:-1]]
    folders = [f for f in folders if f]
    return "/".join([*folders, name])


def safe_component(raw: str) -> str:
    """One path segment, with every separator and control character removed."""
    part = unicodedata.normalize("NFC", raw.replace("\\", "/").replace("/", "_"))
    part = _UNSAFE.sub("_", part).strip().strip(".")
    return part[:120]


def safe_filename(raw: str) -> str:
    """Reduce a browser-supplied filename to something safe to write.

    This is the security boundary of the whole feature: the name comes from
    the client and is used to build a path. A name like '../../etc/cron.d/x'
    must not escape the staging directory.

    Unicode is preserved deliberately. The library is full of diacritics
    (Cesária Évora, Górecki) and beets is configured with asciify_paths: no,
    so mangling them here would be inconsistent and lossy.
    """
    # Take the last component under either separator: a Windows client sends
    # backslashes, and os.path.basename on Linux would not split those.
    name = raw.replace("\\", "/").rsplit("/", 1)[-1]

    # Normalise so that visually identical names compare equal, and so a
    # decomposed sequence cannot smuggle in a combining character.
    name = unicodedata.normalize("NFC", name)
    name = _UNSAFE.sub("_", name).strip().strip(".")

    if not name or name in {".", ".."}:
        raise RejectedUpload("file has no usable name")

    if len(name) > 200:
        stem, dot, ext = name.rpartition(".")
        name = (stem[:190] + dot + ext) if dot else name[:200]

    return name


def check_extension(name: str) -> str:
    ext = Path(name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise RejectedUpload(f"{ext or 'that file type'} is not music")
    return ext


def is_audio(name: str) -> bool:
    return Path(name).suffix.lower() in AUDIO_EXTENSIONS


def check_size(size: int) -> None:
    if size <= 0:
        raise RejectedUpload("file is empty")
    if size > MAX_FILE_BYTES:
        raise RejectedUpload(
            f"file is {size / 1e9:.1f} GB; the limit is {MAX_FILE_BYTES / 1e9:.0f} GB"
        )


def staging_path(root: Path, batch_id: str, filename: str) -> Path:
    """Resolve a destination and prove it stays inside the batch directory.

    safe_filename should make this impossible, but a path-traversal check is
    cheap and this is the one place a mistake writes arbitrary files.
    """
    batch_dir = (root / batch_id).resolve()
    target = (batch_dir / filename).resolve()
    if not target.is_relative_to(batch_dir):
        raise RejectedUpload("refusing to write outside the batch directory")
    return target


# ── batch records ────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS import_batches (
    id          TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL,
    finished_at TEXT,
    status      TEXT NOT NULL,
    message     TEXT,
    log         TEXT
);

CREATE TABLE IF NOT EXISTS import_files (
    id       INTEGER PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    name     TEXT NOT NULL,
    bytes    INTEGER NOT NULL,
    status   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS import_files_batch ON import_files(batch_id);
"""

# staging  → files are arriving
# queued   → upload finished, waiting for the worker
# running  → beets is working
# imported → everything matched and is in the library
# partial  → some matched; the rest are in quarantine awaiting a decision
# failed   → the import could not run at all
STATUSES = {"staging", "queued", "running", "imported", "partial", "failed"}


def create_batch(conn: sqlite3.Connection, batch_id: str) -> None:
    conn.execute(
        "INSERT INTO import_batches (id, created_at, status) VALUES (?, ?, 'staging')",
        (batch_id, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()


def add_file(conn: sqlite3.Connection, batch_id: str, name: str, size: int) -> None:
    conn.execute(
        "INSERT INTO import_files (batch_id, name, bytes, status) "
        "VALUES (?, ?, ?, 'uploaded')",
        (batch_id, name, size),
    )
    conn.commit()


def set_status(
    conn: sqlite3.Connection,
    batch_id: str,
    status: str,
    message: str | None = None,
    log: str | None = None,
) -> None:
    if status not in STATUSES:
        raise ValueError(f"unknown status {status!r}")
    finished = (
        datetime.now(timezone.utc).isoformat()
        if status in {"imported", "partial", "failed"}
        else None
    )
    conn.execute(
        "UPDATE import_batches SET status = ?, message = COALESCE(?, message), "
        "log = COALESCE(?, log), finished_at = COALESCE(?, finished_at) WHERE id = ?",
        (status, message, log, finished, batch_id),
    )
    conn.commit()


def get_batch(conn: sqlite3.Connection, batch_id: str) -> dict | None:
    row = conn.execute(
        "SELECT * FROM import_batches WHERE id = ?", (batch_id,)
    ).fetchone()
    if row is None:
        return None
    files = conn.execute(
        "SELECT name, bytes, status FROM import_files WHERE batch_id = ? ORDER BY name",
        (batch_id,),
    ).fetchall()
    batch = dict(row)
    batch["files"] = [dict(f) for f in files]
    return batch


def list_batches(conn: sqlite3.Connection, limit: int = 25) -> list[dict]:
    rows = conn.execute(
        "SELECT b.*, COUNT(f.id) AS file_count, COALESCE(SUM(f.bytes), 0) AS bytes "
        "FROM import_batches b LEFT JOIN import_files f ON f.batch_id = b.id "
        "GROUP BY b.id ORDER BY b.created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


# ── running beets ────────────────────────────────────────────────────────

def beets_command(config: Path, staging: Path) -> list[str]:
    """The import command.

    `-q` is the whole design: quiet mode applies only matches beets is
    confident about and skips the rest rather than asking. Combined with
    `quiet_fallback: skip` in the config, an uncertain album is left in
    staging for us to quarantine — never guessed at.
    """
    return [
        "beet", "-c", str(config),
        "import", "-q",
        str(staging),
    ]


def run_import(
    conn: sqlite3.Connection,
    batch_id: str,
    staging_root: Path,
    quarantine_root: Path,
    config: Path,
    timeout: int = 1800,
) -> dict:
    """Import one batch. Returns a summary; never raises for import failure.

    Runs synchronously; callers put it on a background task. Acoustic
    fingerprinting is the slow step and a Pi is not fast at it, hence the
    generous timeout.
    """
    staging = staging_root / batch_id
    set_status(conn, batch_id, "running")

    if not staging.exists() or not any(staging.iterdir()):
        set_status(conn, batch_id, "failed", "nothing was uploaded")
        return {"status": "failed", "imported": 0, "quarantined": 0}

    try:
        proc = subprocess.run(
            beets_command(config, staging),
            capture_output=True, text=True, timeout=timeout,
        )
        output = (proc.stdout or "") + (proc.stderr or "")
    except subprocess.TimeoutExpired:
        set_status(conn, batch_id, "failed", f"import timed out after {timeout // 60} minutes")
        return {"status": "failed", "imported": 0, "quarantined": 0}
    except FileNotFoundError:
        set_status(
            conn, batch_id, "failed",
            "beets is not installed in this container",
        )
        return {"status": "failed", "imported": 0, "quarantined": 0}

    # beets moves what it accepted. Whatever survives in staging is what it
    # would not commit to — that is the quarantine, and the reason this can
    # run unattended without corrupting the library.
    leftovers = [p for p in staging.rglob("*") if p.is_file() and is_audio(p.name)]

    quarantined = 0
    if leftovers:
        destination = quarantine_root / batch_id
        destination.mkdir(parents=True, exist_ok=True)
        for path in leftovers:
            try:
                shutil.move(str(path), str(destination / path.name))
                quarantined += 1
            except OSError:
                pass
        conn.execute(
            "UPDATE import_files SET status = 'quarantined' "
            "WHERE batch_id = ? AND name IN ({})".format(
                ",".join("?" * len(leftovers))
            ),
            (batch_id, *[p.name for p in leftovers]),
        )

    conn.execute(
        "UPDATE import_files SET status = 'imported' "
        "WHERE batch_id = ? AND status = 'uploaded'",
        (batch_id,),
    )
    conn.commit()

    total = conn.execute(
        "SELECT COUNT(*) AS n FROM import_files WHERE batch_id = ?", (batch_id,)
    ).fetchone()["n"]
    imported = max(0, total - quarantined)

    shutil.rmtree(staging, ignore_errors=True)

    if quarantined and imported:
        status, message = "partial", (
            f"{imported} imported; {quarantined} could not be matched confidently"
        )
    elif quarantined:
        status, message = "partial", (
            f"{quarantined} could not be matched confidently and are held for review"
        )
    else:
        status, message = "imported", f"{imported} files imported"

    set_status(conn, batch_id, status, message, output[-8000:])
    return {"status": status, "imported": imported, "quarantined": quarantined}
