#!/usr/bin/env python3
"""Drop an album from Nyx Audio — from the beets library AND the staging source.

    python3 tools/drop.py "rahman"            # preview what matches
    python3 tools/drop.py "rahman" --apply    # do it

The organised copy in ~/nyx-library is deleted; the original in nyx-staging/
is MOVED to _quarantine/, never deleted, so you can always change your mind.
"""
import argparse, os, shutil, subprocess, sys
from pathlib import Path

BEET = "/Users/nil/miniconda3/envs/general/bin/beet"
ROOT = Path(__file__).resolve().parent.parent
STAGE, QUAR = ROOT / "nyx-staging", ROOT / "_quarantine"
AUDIO = {".flac", ".mp3", ".wav", ".m4a"}


def tag(path, field):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                        f"format_tags={field}", "-of", "default=nw=1:nk=1", str(path)],
                       capture_output=True, text=True)
    return r.stdout.strip().split("\n")[0]


def album_dirs():
    for d in STAGE.rglob("*"):
        if d.is_dir() and any(f.suffix.lower() in AUDIO for f in d.iterdir() if f.is_file()):
            yield d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("query", help="text to match against album or artist")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    q = a.query.lower()

    # 1. staging sources
    hits = []
    for d in album_dirs():
        first = next((f for f in sorted(d.iterdir()) if f.suffix.lower() in AUDIO), None)
        alb = tag(first, "album") if first else ""
        art = tag(first, "albumartist") or (tag(first, "artist") if first else "")
        blob = f"{d.name} {alb} {art}".lower()
        if q in blob:
            n = sum(1 for f in d.iterdir() if f.suffix.lower() in AUDIO)
            sz = sum(f.stat().st_size for f in d.iterdir() if f.suffix.lower() in AUDIO)
            hits.append((d, alb or d.name, art, n, sz))

    # 2. library entries
    lib = subprocess.run([BEET, "ls", "-a", "-f", "$albumartist — $album", a.query],
                         capture_output=True, text=True).stdout.strip()

    print(f'\n▚ staging sources matching "{a.query}"')
    if not hits:
        print("   none")
    for d, alb, art, n, sz in hits:
        print(f"   {n:>3} tk  {sz/1024**2:7.0f} MB  {art} — {alb}")
        print(f"            {d.relative_to(ROOT)}")

    print(f'\n▚ library albums matching "{a.query}"')
    print("   " + (lib.replace("\n", "\n   ") if lib else "none"))

    if not a.apply:
        print("\n   Preview only. Re-run with --apply to remove.")
        return

    if lib:
        subprocess.run([BEET, "remove", "-a", "-d", "-f", a.query])
        print("\n   removed from library (organised copy deleted)")
    QUAR.mkdir(exist_ok=True)
    for d, *_ in hits:
        dest = QUAR / d.name
        if dest.exists():
            shutil.rmtree(dest)
        shutil.move(str(d), str(dest))
        print(f"   quarantined source: {d.name}")
    print("\n   Done. Recover anything from _quarantine/ if you change your mind.")


if __name__ == "__main__":
    main()
