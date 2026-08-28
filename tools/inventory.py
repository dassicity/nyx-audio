#!/usr/bin/env python3
"""Inventory a messy music folder before importing it with beets.

    python3 tools/inventory.py ~/path/to/music
    python3 tools/inventory.py ~/path/to/music --probe    # slower, exact codecs
"""
import argparse, os, re, subprocess, sys
from collections import defaultdict
from pathlib import Path

LOSSLESS  = {'.flac', '.wav', '.aiff', '.aif', '.ape', '.wv', '.dsf', '.dff', '.tak'}
LOSSY     = {'.mp3', '.ogg', '.opus', '.aac', '.wma', '.m4b', '.mpc'}
AMBIGUOUS = {'.m4a', '.mp4'}          # AAC or ALAC — only probing tells you
AUDIO     = LOSSLESS | LOSSY | AMBIGUOUS


def human(n):
    for unit in ('B', 'KB', 'MB', 'GB', 'TB'):
        if n < 1024 or unit == 'TB':
            return f'{n:,.1f} {unit}' if unit != 'B' else f'{n:,.0f} B'
        n /= 1024


def normalise(name):
    """Collapse an album folder name to something comparable."""
    s = name.lower()
    s = re.sub(r'\[[^\]]*\]|\([^)]*\)', ' ', s)      # [flac], (1989), (320)
    s = re.sub(r'\b(19|20)\d{2}\b', ' ', s)          # bare years
    s = re.sub(r'\b(ustad|feat|ft)\b', ' ', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return ' '.join(s.split())


def probe(path):
    try:
        out = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'a:0',
             '-show_entries', 'stream=codec_name,sample_rate,bits_per_raw_sample,channels',
             '-of', 'default=nw=1:nk=1', str(path)],
            capture_output=True, text=True, timeout=20)
        parts = out.stdout.split()
        return parts[0] if parts else '?'
    except Exception:
        return '?'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('root', type=Path)
    ap.add_argument('--probe', action='store_true',
                    help='use ffprobe to resolve .m4a and read real codecs (slow)')
    args = ap.parse_args()
    root = args.root.expanduser().resolve()
    if not root.is_dir():
        sys.exit(f'not a directory: {root}')

    by_ext = defaultdict(lambda: [0, 0])       # ext -> [count, bytes]
    groups = {}                                # top-level entry -> stats
    loose, junk, wavs = [], [], []

    for entry in sorted(os.scandir(root), key=lambda e: e.name.lower()):
        if entry.name.startswith('.'):
            continue
        if entry.is_file():
            ext = Path(entry.name).suffix.lower()
            if ext in AUDIO:
                loose.append((entry.name, entry.stat().st_size, ext))
                by_ext[ext][0] += 1
                by_ext[ext][1] += entry.stat().st_size
                if ext == '.wav':
                    wavs.append((entry.path, entry.stat().st_size))
            else:
                junk.append((entry.name, entry.stat().st_size))
            continue

        exts, count, size, nonaudio = defaultdict(int), 0, 0, 0
        for dirpath, _, files in os.walk(entry.path):
            for f in files:
                if f.startswith('.'):
                    continue
                p = Path(dirpath) / f
                ext = p.suffix.lower()
                try:
                    sz = p.stat().st_size
                except OSError:
                    continue
                if ext in AUDIO:
                    exts[ext] += 1
                    count += 1
                    size += sz
                    by_ext[ext][0] += 1
                    by_ext[ext][1] += sz
                    if ext == '.wav':
                        wavs.append((str(p), sz))
                else:
                    nonaudio += 1
        groups[entry.name] = dict(exts=dict(exts), count=count, size=size, nonaudio=nonaudio)

    total_files = sum(v[0] for v in by_ext.values())
    total_size  = sum(v[1] for v in by_ext.values())

    print('=' * 74)
    print(f'  {root}')
    print(f'  {total_files:,} audio files · {human(total_size)}')
    print('=' * 74)

    print('\n▚ FORMATS\n')
    print(f'  {"ext":<8}{"files":>8}{"size":>13}{"share":>9}   class')
    print('  ' + '-' * 62)
    ll = ly = am = 0
    for ext, (c, s) in sorted(by_ext.items(), key=lambda kv: -kv[1][1]):
        kind = ('lossless' if ext in LOSSLESS else
                'lossy'    if ext in LOSSY else 'depends — probe it')
        if ext in LOSSLESS: ll += s
        elif ext in LOSSY:  ly += s
        else:               am += s
        pct = 100 * s / total_size if total_size else 0
        print(f'  {ext:<8}{c:>8}{human(s):>13}{pct:>8.1f}%   {kind}')
    print('  ' + '-' * 62)
    if total_size:
        print(f'  lossless {100*ll/total_size:5.1f}%   '
              f'lossy {100*ly/total_size:5.1f}%   '
              f'unresolved {100*am/total_size:5.1f}%')

    if loose:
        print(f'\n▚ LOOSE FILES AT ROOT  ({len(loose)})')
        print('  These are not albums. Import separately with:  beet import -s\n')
        for name, sz, _ in sorted(loose, key=lambda x: -x[1]):
            print(f'  {human(sz):>11}  {name}')

    if junk:
        print(f'\n▚ NOT MUSIC  ({len(junk)})')
        print('  Move these out before importing.\n')
        for name, sz in junk:
            print(f'  {human(sz):>11}  {name}')

    print(f'\n▚ FOLDERS  ({len(groups)})\n')
    print(f'  {"tracks":>7}{"size":>12}   formats                folder')
    print('  ' + '-' * 70)
    mixed = []
    for name, g in sorted(groups.items(), key=lambda kv: kv[0].lower()):
        if g['count'] == 0:
            print(f'  {"—":>7}{"—":>12}   {"NO AUDIO":<22} {name}')
            continue
        fmt = ' '.join(f'{k.lstrip(".")}×{v}' for k, v in
                       sorted(g['exts'].items(), key=lambda kv: -kv[1]))
        flag = ''
        audio_exts = set(g['exts'])
        if len(audio_exts) > 1:
            mixed.append(name)
            flag = ' ⚠'
        print(f'  {g["count"]:>7}{human(g["size"]):>12}   {fmt:<22}{flag} {name}')

    if mixed:
        print(f'\n  ⚠ {len(mixed)} folder(s) contain more than one format — check these are')
        print('    really one album and not two editions merged together.')

    # duplicate detection
    seen = defaultdict(list)
    for name in groups:
        key = normalise(name)
        if key:
            seen[key].append(name)
    dups = {k: v for k, v in seen.items() if len(v) > 1}
    if dups:
        print('\n▚ LIKELY DUPLICATES\n')
        for key, names in dups.items():
            print(f'  "{key}"')
            for n in names:
                g = groups[n]
                print(f'      {g["count"]:>4} tracks  {human(g["size"]):>11}  {n}')

    if wavs:
        tot = sum(s for _, s in wavs)
        print(f'\n▚ WAV FILES  ({len(wavs)} · {human(tot)})')
        print('  Lossless but effectively untaggable. Convert to FLAC before importing —')
        print(f'  identical audio, roughly {human(tot * 0.45)} saved, and real metadata.\n')
        for p, s in sorted(wavs, key=lambda x: -x[1])[:15]:
            print(f'  {human(s):>11}  {os.path.relpath(p, root)}')

    if args.probe and any(e in by_ext for e in AMBIGUOUS):
        print('\n▚ PROBING .m4a / .mp4 (AAC is lossy, ALAC is lossless)\n')
        codecs = defaultdict(int)
        for dirpath, _, files in os.walk(root):
            for f in files:
                if Path(f).suffix.lower() in AMBIGUOUS:
                    codecs[probe(Path(dirpath) / f)] += 1
        for c, n in sorted(codecs.items(), key=lambda kv: -kv[1]):
            label = 'lossless' if c == 'alac' else 'lossy' if c else '?'
            print(f'  {c or "?":<12}{n:>6} files   {label}')

    print()


if __name__ == '__main__':
    main()
