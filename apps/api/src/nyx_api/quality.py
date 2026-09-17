"""Detecting lossy audio wearing a lossless extension.

A large share of "FLAC" in the wild is a transcode: someone decoded an MP3 and
re-encoded it as FLAC. The file is genuinely lossless — it losslessly preserves
audio that already had its top octave thrown away. Tags cannot tell you this;
only the spectrum can.

Every lossy encoder lowpasses. MP3 at 320 kbps cuts around 20 kHz, 192 around
19 kHz, 128 around 16 kHz. Real CD-rate audio runs to Nyquist at 22.05 kHz. So
a sharp, sustained absence of energy well below Nyquist is the signature.

This is a heuristic and is treated as one: it flags files for a human to look
at, and never deletes anything. Some genuine recordings legitimately have no
high-frequency content — a 1950s mono jazz session, a solo cello, an old
analogue tape — and the caller is expected to show the evidence rather than
act on the verdict alone.
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np

# Calibrated against a known transcode chain (FLAC → MP3 → FLAC at 128, 192
# and 320) and against genuine CD rips and cassette-sourced qawwali from a
# real library. The numbers below come from those measurements, not from
# first principles.
#
#                       cutoff ratio    transition width
#   128 kbps transcode      0.74            0.60 kHz
#   cassette-sourced        0.64-0.90       3.6-10.7 kHz
#   CD rip                  0.93-1.00       6.4-15.5 kHz
#
# Two independent signals, and they answer different questions. The ratio
# says "is bandwidth missing"; the transition width says "was it cut, or did
# it fade". Neither alone is enough: the ratio alone condemns every tape
# transfer, and the width alone misses everything above 128 kbps.
SUSPECT_CUTOFF_RATIO = 0.92
CLIFF_TRANSITION_KHZ = 2.0

# Levels of the dB scale used to locate the filter edge, relative to the
# passband rather than the spectral peak. Peak-relative measurement tracks
# whatever is loudest in the music, which is not what we are asking about.
PASSBAND_LO_HZ, PASSBAND_HI_HZ = 1000, 5000
EDGE_TOP_DB, EDGE_BOTTOM_DB = -10.0, -60.0

# Frames analysed. Enough to survive a quiet intro without reading a whole
# 26-minute movement into memory.
FRAMES = 24
FFT_SIZE = 4096


@dataclass(frozen=True)
class Spectrum:
    sample_rate: int
    """Highest frequency still carrying energy, in Hz."""
    cutoff_hz: float
    nyquist_hz: float
    """How many kHz it takes to fall from -10 dB to -60 dB below the passband.

    The difference between a filter and a fade, and the only signal that
    distinguishes a 128 kbps source from a cassette with the same bandwidth.
    """
    transition_khz: float = 0.0

    @property
    def ratio(self) -> float:
        return self.cutoff_hz / self.nyquist_hz if self.nyquist_hz else 0.0


Confidence = str  # "clean" | "possible" | "likely"


@dataclass(frozen=True)
class Verdict:
    """Graded, because the evidence genuinely supports three answers.

    A boolean would have to choose between condemning every tape transfer and
    missing every 320 kbps transcode.
    """
    confidence: Confidence
    cutoff_hz: float
    nyquist_hz: float
    ratio: float
    transition_khz: float
    reason: str

    @property
    def suspect(self) -> bool:
        return self.confidence != "clean"

    def as_dict(self) -> dict:
        return {
            "confidence": self.confidence,
            "suspect": self.suspect,
            "cutoff_hz": round(self.cutoff_hz),
            "nyquist_hz": round(self.nyquist_hz),
            "ratio": round(self.ratio, 3),
            "transition_khz": round(self.transition_khz, 2),
            "reason": self.reason,
        }


def find_cutoff(samples: np.ndarray, sample_rate: int) -> Spectrum:
    """Locate the filter edge and measure how abrupt it is.

    Averaged over several windows: a single frame can land on a quiet passage
    and report a cutoff that says more about the music than the encoding.
    """
    samples = np.asarray(samples, dtype=np.float64)
    if samples.ndim > 1:  # mix to mono; channels rarely differ in bandwidth
        samples = samples.mean(axis=1)

    nyquist = sample_rate / 2
    if samples.size < FFT_SIZE:
        return Spectrum(sample_rate, nyquist, nyquist, 0.0)

    window = np.hanning(FFT_SIZE)
    starts = np.linspace(0, samples.size - FFT_SIZE, FRAMES, dtype=int)
    accum = np.zeros(FFT_SIZE // 2 + 1)
    for start in starts:
        accum += np.abs(np.fft.rfft(samples[start:start + FFT_SIZE] * window))
    accum /= len(starts)

    if accum.max() <= 0:
        return Spectrum(sample_rate, 0.0, nyquist, 0.0)

    db = 20 * np.log10(np.maximum(accum, 1e-12) / accum.max())
    freqs = np.fft.rfftfreq(FFT_SIZE, 1 / sample_rate)

    band = (freqs >= PASSBAND_LO_HZ) & (freqs <= PASSBAND_HI_HZ)
    passband = float(np.median(db[band])) if band.any() else 0.0

    def highest_above(delta: float) -> float:
        idx = np.nonzero(db > passband + delta)[0]
        return float(freqs[idx[-1]]) if idx.size else 0.0

    top, bottom = highest_above(EDGE_TOP_DB), highest_above(EDGE_BOTTOM_DB)
    transition = max(0.05, (bottom - top) / 1000)
    return Spectrum(sample_rate, bottom, nyquist, transition)


def judge(spectrum: Spectrum, lossless: bool) -> Verdict:
    """Turn a measured spectrum into something worth showing a person."""
    ratio, khz = spectrum.ratio, spectrum.cutoff_hz / 1000
    width = spectrum.transition_khz
    make = lambda c, why: Verdict(
        c, spectrum.cutoff_hz, spectrum.nyquist_hz, ratio, width, why)

    if not lossless:
        return make("clean", f"lossy file, content to {khz:.1f} kHz as expected")

    if ratio >= SUSPECT_CUTOFF_RATIO:
        return make("clean", f"content to {khz:.1f} kHz, close to Nyquist — consistent with lossless")

    likely = "128 kbps" if khz < 17 else "192 kbps" if khz < 19.5 else "256-320 kbps"

    if width <= CLIFF_TRANSITION_KHZ:
        return make("likely",
            f"cut off at {khz:.1f} kHz in {width:.1f} kHz — an encoder's edge, "
            f"not a fade. Almost certainly a {likely} source re-encoded as lossless.")

    # Bandwidth is missing, but it fades rather than stops. A tape transfer
    # looks exactly like this, and so does a high-bitrate transcode.
    return make("possible",
        f"nothing above {khz:.1f} kHz, but it fades over {width:.1f} kHz rather "
        f"than stopping. That is the shape of an analogue source — a cassette or "
        f"a tape transfer — though a {likely} source cannot be ruled out. Listen "
        f"before deciding.")


# ── reading real files ───────────────────────────────────────────────────

def probe(path: Path) -> dict:
    """Format facts from ffprobe. Empty dict when it cannot be read."""
    try:
        proc = subprocess.run(
            [
                "ffprobe", "-v", "error", "-select_streams", "a:0",
                "-show_entries", "stream=sample_rate,bits_per_raw_sample,codec_name",
                "-of", "json", str(path),
            ],
            capture_output=True, text=True, timeout=30,
        )
        streams = json.loads(proc.stdout or "{}").get("streams") or [{}]
        return streams[0]
    except (subprocess.SubprocessError, json.JSONDecodeError, OSError):
        return {}


LOSSLESS_CODECS = {"flac", "alac", "pcm_s16le", "pcm_s24le", "wavpack", "ape", "tta"}


def decode(path: Path, seconds: float = 90.0, skip: float = 20.0) -> tuple[np.ndarray, int]:
    """Decode a slice to mono float32 via ffmpeg.

    Skips the opening: intros fade in, and a quiet start reads as a low cutoff.
    """
    info = probe(path)
    rate = int(info.get("sample_rate") or 44100)

    proc = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-ss", str(skip), "-t", str(seconds),
            "-i", str(path), "-map", "0:a:0", "-ac", "1",
            "-f", "f32le", "-acodec", "pcm_f32le", "-",
        ],
        capture_output=True, timeout=180,
    )
    if not proc.stdout:
        # Too short to skip into; take it from the beginning instead.
        proc = subprocess.run(
            [
                "ffmpeg", "-v", "error", "-t", str(seconds), "-i", str(path),
                "-map", "0:a:0", "-ac", "1", "-f", "f32le", "-acodec", "pcm_f32le", "-",
            ],
            capture_output=True, timeout=180,
        )
    return np.frombuffer(proc.stdout, dtype=np.float32), rate


def inspect(path: Path) -> Verdict | None:
    """Analyse one file. None when it could not be decoded at all."""
    info = probe(path)
    codec = (info.get("codec_name") or "").lower()
    lossless = codec in LOSSLESS_CODECS or path.suffix.lower() in {
        ".flac", ".alac", ".wav", ".aiff", ".aif", ".ape", ".wv",
    }

    try:
        samples, rate = decode(path)
    except (subprocess.SubprocessError, OSError):
        return None
    if samples.size == 0:
        return None

    return judge(find_cutoff(samples, rate), lossless)
