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
import tempfile
import threading
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import yaml

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

-- A person's decision about one held album. Kept separately from the log,
-- because the log records what beets thought, and this records what you did.
CREATE TABLE IF NOT EXISTS import_resolutions (
    id         INTEGER PRIMARY KEY,
    batch_id   TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    folder     TEXT NOT NULL,
    action     TEXT NOT NULL,
    release_id TEXT,
    outcome    TEXT NOT NULL,
    message    TEXT,
    at         TEXT NOT NULL
);
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
    batch["log"] = clean_log(batch.get("log") or "")
    # Only the automatic run: resolutions are appended below the marker and
    # are described by their own records, not re-parsed as fresh albums.
    albums = summarise(batch["log"].split(RESOLVED_MARKER, 1)[0], batch_id)
    resolved = {
        r["folder"]: dict(r) for r in conn.execute(
            "SELECT folder, action, release_id, outcome, message, at "
            "FROM import_resolutions WHERE batch_id = ? ORDER BY id", (batch_id,))
    }
    for album in albums:
        album["resolution"] = resolved.get(album["folder"]) if album["folder"] is not None else None
    batch["albums"] = albums
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

    `-v` makes beets write down its reasoning — every candidate and its
    distance. Without it the log said only "Skipping.", which is how a
    fingerprinting penalty went undiagnosed through several imports.
    """
    return [
        "beet", "-v", "-c", str(config),
        "import", "-q",
        str(staging),
    ]


# Separates the automatic run's output from any later by-hand resolutions in
# the stored log. Everything after it is a person's decision, which is
# recorded in import_resolutions — summarising it again would show the same
# album twice.
RESOLVED_MARKER = "\n\n── resolved by hand"

# Two concurrent imports would write the same beets library database. Rare in
# a single-user app, but an upload finishing while you resolve another album
# is exactly when it would happen.
BEETS_LOCK = threading.Lock()

# beets needs a distance at or below this to file an album unattended.
STRONG_DISTANCE = 0.04

_TAGGING = re.compile(r"^Tagging (?P<album>.+)$")
_CANDIDATE = re.compile(
    r"^Candidate: (?P<name>.+?)(?: \((?P<id>[0-9a-f]{8}-[0-9a-f-]{27})\))?(?: from \w+)?$")
_DISTANCE = re.compile(r"^Success\. Distance: (?P<d>[0-9.]+)$")
# The line beets prints for the album directory it is deciding about.
_ALBUM_PATH = re.compile(r"^(?P<path>/.+?) \((?P<n>\d+) items?\)$")
_ANSI = re.compile(r"\x1b\[[0-9;]*m")
# What beets 2.14 actually prints for a duplicate in quiet mode, verified
# against a real run. The "already in the library!" warning only appears on
# the interactive path, so matching that alone reported duplicates as "held".
_DUPLICATE = re.compile(r"found duplicates: \[[^\]]|already in the library")
_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def beets_error(log: str) -> str | None:
    """The fatal error beets reported, if it stopped before deciding anything.

    beets prints 'error: ...' on the way out when it cannot run at all — a
    missing library directory, an unreadable config, a prompt with no one to
    answer it.
    """
    for line in reversed(clean_log(log).splitlines()):
        line = line.strip()
        if line.startswith("error:") or " error: " in line:
            return line.split("error:", 1)[1].strip() or line
    return None


def clean_log(log: str) -> str:
    """Strip terminal colour codes. beets colours its output for a terminal,
    and the escape sequences arrive in the browser as '[1;34m' noise."""
    return _ANSI.sub("", log or "")


def summarise(log: str, batch_id: str | None = None) -> list[dict]:
    """Turn beets' verbose output into one line of reasoning per album.

    What a person needs from that output is not the output: it is "what did
    beets think this was, how sure was it, and what did it do". Each album
    becomes {album, folder, best_match, distance, similarity, decision,
    candidates}. `folder` is where the files are, relative to the batch, so a
    held album can be resolved; `candidates` are what beets considered, so a
    person can pick one.
    """
    albums: list[dict] = []
    current: dict | None = None
    pending: tuple[str, str | None] | None = None

    for raw in clean_log(log).splitlines():
        line = raw.strip()
        if m := _TAGGING.match(line):
            current = {"album": m["album"], "folder": None, "best_match": None,
                       "distance": None, "decision": "unknown", "candidates": {}}
            albums.append(current)
            pending = None
        elif current is None:
            continue
        elif m := _CANDIDATE.match(line):
            pending = (m["name"], m["id"])
        elif (m := _DISTANCE.match(line)) and pending:
            d = float(m["d"])
            name, mbid = pending
            if current["distance"] is None or d < current["distance"]:
                current["distance"], current["best_match"] = d, name
            if mbid:
                known = current["candidates"].get(mbid)
                if known is None or d < known["distance"]:
                    current["candidates"][mbid] = {"id": mbid, "name": name, "distance": d}
            pending = None
        elif (m := _ALBUM_PATH.match(line)) and batch_id:
            marker = f"/{batch_id}"
            path = m["path"]
            if marker in path:
                current["folder"] = path.split(marker, 1)[1].lstrip("/")
        elif line == "Skipping.":
            current["decision"] = "held"
        elif line.startswith(("No candidates found", "No matching release")):
            current["decision"] = "held"

    for album in albums:
        d = album["distance"]
        album["similarity"] = None if d is None else round((1 - d) * 100, 1)
        album["candidates"] = [
            {**c, "similarity": round((1 - c["distance"]) * 100, 1)}
            for c in sorted(album["candidates"].values(), key=lambda c: c["distance"])
        ]
        if album["decision"] == "unknown":
            album["decision"] = (
                "imported" if d is not None and d <= STRONG_DISTANCE else "held"
            )
    return albums


def run_import(
    conn: sqlite3.Connection,
    batch_id: str,
    staging_root: Path,
    quarantine_root: Path,
    config: Path,
    timeout: int = 1800,
) -> dict:
    """Import one batch. Returns a summary; never raises for import failure.

    Runs synchronously; callers put it on a background task.
    """
    staging = staging_root / batch_id
    set_status(conn, batch_id, "running")

    if not staging.exists() or not any(staging.iterdir()):
        set_status(conn, batch_id, "failed", "nothing was uploaded")
        return {"status": "failed", "imported": 0, "quarantined": 0}

    try:
        with BEETS_LOCK:
            proc = subprocess.run(
                beets_command(config, staging),
                # Nobody is at the keyboard. A prompt must fail, not wait.
                stdin=subprocess.DEVNULL,
                # One stream, in the order beets wrote it. Concatenating
                # stdout and stderr afterwards put errors after the decisions
                # they preceded, which made the log misleading to read.
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, timeout=timeout,
            )
        output = proc.stdout or ""
    except subprocess.TimeoutExpired:
        set_status(conn, batch_id, "failed", f"import timed out after {timeout // 60} minutes")
        return {"status": "failed", "imported": 0, "quarantined": 0}
    except FileNotFoundError:
        set_status(conn, batch_id, "failed", "beets is not installed in this container")
        return {"status": "failed", "imported": 0, "quarantined": 0}

    # beets moves what it accepted. Whatever survives in staging is what it
    # would not commit to — that is the quarantine.
    leftovers = sorted(p for p in staging.rglob("*") if p.is_file() and is_audio(p.name))

    # Leftovers mean "held" ONLY if beets actually looked at them. If it
    # stopped before deciding anything, every file is left over for a reason
    # that has nothing to do with matching — and reporting that as "no
    # confident match" sends someone hunting for a tagging problem that does
    # not exist. The files stay in staging, untouched, for a retry.
    decided = summarise(output)
    error = beets_error(output)
    if leftovers and (not decided or (proc.returncode != 0 and error)):
        reason = error or "beets exited without evaluating any album"
        set_status(conn, batch_id, "failed", f"beets did not run: {reason}",
                   clean_log(output)[-20000:])
        return {"status": "failed", "imported": 0, "quarantined": 0}

    # Recorded under the SAME relative path the upload was stored under
    # ("Album/01 Track.flac"). Matching on bare filenames left every
    # quarantined row marked 'uploaded', which then became 'imported' — the
    # interface reported held files as filed, and listed none for review.
    destination = quarantine_root / batch_id
    held: list[str] = []
    for path in leftovers:
        rel = path.relative_to(staging).as_posix()
        target = destination / rel
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(path), str(target))
            held.append(rel)
        except OSError:
            pass

    if held:
        conn.execute(
            "UPDATE import_files SET status = 'quarantined' "
            "WHERE batch_id = ? AND name IN ({})".format(",".join("?" * len(held))),
            (batch_id, *held),
        )
    # Only audio can be imported; cover art and rip logs ride along with it.
    conn.execute(
        "UPDATE import_files SET status = 'imported' "
        "WHERE batch_id = ? AND status = 'uploaded'",
        (batch_id,),
    )
    conn.commit()

    audio_total = sum(
        1 for row in conn.execute(
            "SELECT name FROM import_files WHERE batch_id = ?", (batch_id,)
        ) if is_audio(row["name"])
    )
    quarantined = len(held)
    imported = max(0, audio_total - quarantined)

    shutil.rmtree(staging, ignore_errors=True)

    if quarantined and imported:
        status, message = "partial", (
            f"{imported} imported; {quarantined} held — no confident match"
        )
    elif quarantined:
        status, message = "partial", f"{quarantined} held — no confident match"
    else:
        status, message = "imported", f"{imported} imported"

    set_status(conn, batch_id, status, message, clean_log(output)[-20000:])
    return {"status": status, "imported": imported, "quarantined": quarantined}


# ── resolving a held album by hand ───────────────────────────────────────
#
# Quarantine exists because beets will not guess. Resolving is a person
# deciding instead: file it as a release they chose, keep the tags it came
# with, or throw it away. Each is one beets run on one album folder.

ACTIONS = {"accept", "asis", "discard"}


def release_id_from(text: str) -> str:
    """A MusicBrainz release id from a pasted id or URL.

    People paste whatever the browser shows them — the id, the release page,
    a link with a trailing slash. All of those contain the UUID.
    """
    m = _UUID.search((text or "").lower())
    if not m:
        raise RejectedUpload("that is not a MusicBrainz release id or link")
    return m.group(0)


def quarantined_folder(root: Path, batch_id: str, folder: str) -> Path:
    """The held album's directory, proven to be inside the batch.

    `folder` comes from the browser, so this is a path-traversal boundary in
    exactly the way the upload filename was.
    """
    base = (root / batch_id).resolve()
    target = (base / folder).resolve() if folder else base
    if not target.is_relative_to(base):
        raise RejectedUpload("refusing to touch anything outside this batch")
    if not target.is_dir():
        raise RejectedUpload("nothing is held there any more")
    return target


def resolve_config(base_config: Path, *, forced: bool, keep_duplicate: bool) -> dict:
    """The automatic config, with the two gates a person's choice must pass.

    beets files an album only when its recommendation is 'strong': distance
    under strong_rec_thresh, and not capped by max_rec for missing or extra
    tracks. When someone has picked the release themselves, beets' confidence
    is no longer the question — so both gates open, for this run only.
    """
    cfg = yaml.safe_load(base_config.read_text())
    cfg["import"].update({"quiet": True, "quiet_fallback": "skip"})
    if forced:
        match = cfg.setdefault("match", {})
        match["strong_rec_thresh"] = 1.0
        match["max_rec"] = {"missing_tracks": "strong", "unmatched_tracks": "strong"}
    if keep_duplicate:
        cfg["import"]["duplicate_action"] = "keep"
    return cfg


def resolve_command(config: Path, folder: Path, action: str, release_id: str | None) -> list[str]:
    cmd = ["beet", "-v", "-c", str(config), "import", "-q"]
    if action == "accept":
        cmd += ["-S", release_id]          # only this release is a candidate
    elif action == "asis":
        cmd += ["-A"]                      # no autotagging: file by existing tags
    return cmd + [str(folder)]


def _files_under(conn: sqlite3.Connection, batch_id: str, folder: str) -> list[str]:
    prefix = f"{folder}/" if folder else ""
    return [
        row["name"] for row in conn.execute(
            "SELECT name FROM import_files WHERE batch_id = ? AND status = 'quarantined'",
            (batch_id,))
        if row["name"].startswith(prefix)
    ]


def _set_file_status(conn: sqlite3.Connection, batch_id: str, names: list[str], status: str) -> None:
    if names:
        conn.execute(
            "UPDATE import_files SET status = ? WHERE batch_id = ? AND name IN ({})".format(
                ",".join("?" * len(names))),
            (status, batch_id, *names),
        )


def _record(conn, batch_id, folder, action, release_id, outcome, message, log) -> None:
    conn.execute(
        "INSERT INTO import_resolutions (batch_id, folder, action, release_id, outcome, message, at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (batch_id, folder, action, release_id, outcome, message,
         datetime.now(timezone.utc).isoformat()),
    )
    if log:
        # Appended, so "What beets said" shows the resolution after the
        # automatic run that held the album in the first place.
        conn.execute(
            "UPDATE import_batches SET log = COALESCE(log, '') || ? WHERE id = ?",
            (f"{RESOLVED_MARKER}: {action} {folder or '(batch)'} ──\n{clean_log(log)[-12000:]}",
             batch_id),
        )

    remaining = conn.execute(
        "SELECT COUNT(*) AS n FROM import_files WHERE batch_id = ? AND status = 'quarantined'",
        (batch_id,),
    ).fetchone()["n"]
    if remaining == 0:
        conn.execute(
            "UPDATE import_batches SET status = 'imported', message = 'all resolved' WHERE id = ?",
            (batch_id,))
    else:
        conn.execute(
            "UPDATE import_batches SET message = ? WHERE id = ?",
            (f"{remaining} still held", batch_id))
    conn.commit()


def resolve(
    conn: sqlite3.Connection,
    batch_id: str,
    folder: str,
    action: str,
    quarantine_root: Path,
    base_config: Path,
    release_id: str | None = None,
    keep_duplicate: bool = False,
    timeout: int = 900,
) -> dict:
    """Carry out a person's decision about one held album.

    Returns {outcome, message, log}. Outcomes:
      filed      beets moved it into the library
      duplicate  it is already in the library; nothing was changed
      held       beets still would not file it (the log says why)
      discarded  the files were deleted
      failed     beets could not run
    """
    if action not in ACTIONS:
        raise RejectedUpload(f"unknown action {action!r}")
    directory = quarantined_folder(quarantine_root, batch_id, folder)
    names = _files_under(conn, batch_id, folder)

    if action == "discard":
        shutil.rmtree(directory, ignore_errors=True)
        _set_file_status(conn, batch_id, names, "discarded")
        message = f"discarded {len(names)} files"
        _record(conn, batch_id, folder, action, None, "discarded", message, "")
        return {"outcome": "discarded", "message": message, "log": ""}

    if action == "accept":
        release_id = release_id_from(release_id or "")

    cfg = resolve_config(base_config, forced=action == "accept", keep_duplicate=keep_duplicate)
    with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as fh:
        yaml.safe_dump(cfg, fh, sort_keys=False, allow_unicode=True)
        cfg_path = Path(fh.name)

    try:
        with BEETS_LOCK:
            proc = subprocess.run(
                resolve_command(cfg_path, directory, action, release_id),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, timeout=timeout,
            )
        log = clean_log(proc.stdout or "")
    except subprocess.TimeoutExpired:
        return {"outcome": "failed", "message": "beets timed out", "log": ""}
    except FileNotFoundError:
        return {"outcome": "failed", "message": "beets is not installed in this container", "log": ""}
    finally:
        cfg_path.unlink(missing_ok=True)

    left = [p for p in directory.rglob("*") if p.is_file() and is_audio(p.name)]
    error = beets_error(log)

    if left and not summarise(log) and action == "accept" or (left and proc.returncode != 0 and error):
        # Same rule as the automatic run: a beets that never evaluated the
        # album has not "held" it. Say what actually happened.
        return {"outcome": "failed",
                "message": f"beets did not run: {error or 'no album was evaluated'}",
                "log": log}

    if not left:
        _set_file_status(conn, batch_id, names, "imported")
        shutil.rmtree(directory, ignore_errors=True)   # only sidecars remain
        outcome, message = "filed", f"filed {len(names)} files into the library"
    elif _DUPLICATE.search(log):
        outcome, message = "duplicate", "this album is already in your library"
    else:
        outcome, message = "held", "beets still would not file it — see what it said"

    _record(conn, batch_id, folder, action, release_id, outcome, message, log)
    return {"outcome": outcome, "message": message, "log": log}
