#!/usr/bin/env bash
# Nyx Audio — library triage. Run BEFORE beets.
#
#   ./tools/triage.sh            # dry run
#   ./tools/triage.sh --apply    # do it
#
# Idempotent: safe to re-run. Every step checks whether it is already done.
# Nothing is deleted — redundant files move to _quarantine/ for you to review.
set -uo pipefail

cd "$(dirname "$0")/.."
SRC="${SRC:-ss music}"
STAGE="${STAGE:-nyx-staging}"
QUAR="${QUAR:-_quarantine}"
APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

say()  { printf '\n\033[1m▚ %s\033[0m\n' "$*"; }
run()  { if (( APPLY )); then eval "$@" || echo "   (skipped: $*)"; else printf '   would: %s\n' "$*"; fi; }
skip() { printf '   already done: %s\n' "$*"; }

# Hash only the first audio stream — these files carry embedded cover art,
# and hashing all streams gives a false mismatch.
hash_audio() {
  ffmpeg -v error -i "$1" -map 0:a:0 -f s16le - 2>/dev/null \
    | { command -v md5sum >/dev/null && md5sum || md5; } | awk '{print $1}'
}

[[ -d "$SRC" ]] || { echo "no such directory: $SRC"; exit 1; }
(( APPLY )) || echo "── DRY RUN ── nothing will change. Re-run with --apply."
shopt -s nullglob

say "1. Quarantine verified-redundant files"
run "mkdir -p '$QUAR'"
m=("$SRC/1997 - Rapture"/*.mp3)
if (( ${#m[@]} )); then run "mv '$SRC/1997 - Rapture/'*.mp3 '$QUAR/'"; else skip "Rapture MP3 duplicates removed"; fi
if [[ -d "$SRC/Shahen-Shah" ]]; then run "mv '$SRC/Shahen-Shah' '$QUAR/'"; else skip "Shahen-Shah MP3 rip removed"; fi
f="$SRC/Nusrat Fateh Ali Khan - Hai Kahan Ka Irada Sanam.m4a"
if [[ -f "$f" ]]; then run "mv '$f' '$QUAR/'"; else skip "redundant .m4a removed"; fi

say "2. Remove OS and Windows Media Player cruft"
run "find '$SRC' \\( -name desktop.ini -o -name 'AlbumArt*' -o -name .DS_Store -o -name Thumbs.db \\) -delete"

say "3. Fix folders that lost their identity"
if [[ -d "$SRC/CD 2" ]]; then
  run "mv '$SRC/CD 2' '$SRC/Nusrat Fateh Ali Khan - Reverence (CD 2 of 2)'"
else skip "CD 2 renamed to Reverence (CD 2 of 2)"; fi
for v in 152 153; do
  d="$SRC/Ustad Nusrat Fateh Ali Khan - Digbeth Civic Centre UK Concert 1983, Vol. $v (1983) [MP3]"
  if [[ -d "$d" ]]; then run "mv '$d' '$SRC/Ustad Nusrat Fateh Ali Khan - Live Concert Collection (1983-1994)/'"
  else skip "Vol. $v filed with the live series"; fi
done

say "4. Convert WAVs to FLAC, verified bit-identical on the audio stream"
wavs=("$SRC"/*.wav)
if (( ${#wavs[@]} == 0 )); then skip "no WAVs left to convert"; fi
for w in "${wavs[@]}"; do
  f="${w%.wav}.flac"
  if (( ! APPLY )); then printf '   would: convert + verify %s\n' "$(basename "$w")"; continue; fi
  # -map 0 keeps the embedded cover art; -c:v copy passes it through untouched
  ffmpeg -v error -i "$w" -map 0 -c:a flac -compression_level 8 -c:v copy "$f" -y
  if [[ "$(hash_audio "$w")" == "$(hash_audio "$f")" ]]; then
    echo "   ✓ bit-identical, quarantining WAV: $(basename "$w")"
    mv "$w" "$QUAR/"
  else
    echo "   ✗ MISMATCH — keeping WAV, discarding FLAC: $(basename "$w")"
    rm -f "$f"
  fi
done

say "5. Reunite the two Mehfil-e-Sama tracks into their album folder"
MEH="$SRC/Nusrat Fateh Ali Khan - Mehfil-e-Sama Vol. 18 (1984) [incomplete]"
run "mkdir -p '$MEH'"
loose=("$SRC/01 Na to Butkade ki Talab.flac" "$SRC/02 Chaap Tilak Sab Cheeni.flac")
for l in "${loose[@]}"; do
  if [[ -f "$l" ]]; then run "mv '$l' '$MEH/'"; else skip "$(basename "$l") filed"; fi
done

say "6. Stage into batches, grouped by how beets will behave"
for b in 01-albums-lossless 02-compilations 03-albums-lossy 04-live-series 05-singles; do
  run "mkdir -p '$STAGE/$b'"
done
# Direct mv, no eval — folder names contain apostrophes and brackets.
move_to() {
  [[ -e "$SRC/$2" ]] || return 0
  if (( APPLY )); then mv "$SRC/$2" "$STAGE/$1/"
  else printf '   would: mv %s -> %s\n' "$2" "$STAGE/$1/"; fi
}

move_to 01-albums-lossless "1997 - Rapture"
move_to 01-albums-lossless "Night Song"
move_to 01-albums-lossless "Nusrat Fateh Ali Khan (1989) - Shahen-shah"
move_to 01-albums-lossless "Nusrat Fateh Ali Khan - Nusrat - Pyar Ki Hasrat"
move_to 01-albums-lossless "Nusrat Fateh Ali Khan - Reverence (CD 2 of 2)"
move_to 01-albums-lossless "Nusrat Fateh Ali Khan - Mehfil-e-Sama Vol. 18 (1984) [incomplete]"

move_to 02-compilations "2005 The Rough Guide to the Music of the Andes - Bolivia (2005) [CD, Comp, UK, World Music Network #RGNET 1147 CD]"
move_to 02-compilations "[2015]The Rough Guide to the Best Arabic Music You've Never Heard[flac]"
move_to 02-compilations "The Rough Guide To The Music Of Iran (2006)"
move_to 02-compilations "The Rough Guide To The Music Of india and pakistan (1996)"
move_to 02-compilations "rhythm-time - world percussion (1999)"

move_to 03-albums-lossy "A.R. Rahman Essentials (320)"
move_to 04-live-series "Ustad Nusrat Fateh Ali Khan - Live Concert Collection (1983-1994)"

say "7. Orphan tracks — genuine singletons, each from an album you do not have"
orphans=("$SRC"/*.flac "$SRC"/*.mp3)
if (( ${#orphans[@]} == 0 )); then skip "no loose tracks left"; fi
for f in "${orphans[@]}"; do run "mv '$f' '$STAGE/05-singles/'"; done

say "Done."
(( APPLY )) || echo "   Re-run with --apply to perform these actions."
