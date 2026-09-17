"""Transcode detection.

Tested against synthetic signals with a known bandwidth, which is the only way
to check this honestly: a real file's true provenance is exactly the thing in
question, so it cannot be the fixture.
"""
from __future__ import annotations

import numpy as np
import pytest

from nyx_api import quality
from nyx_api.quality import find_cutoff, judge

RATE = 44100


def noise(seconds: float = 4.0, rate: int = RATE, seed: int = 7) -> np.ndarray:
    """White noise: flat to Nyquist, so any cutoff we impose is the only one."""
    rng = np.random.default_rng(seed)
    return rng.standard_normal(int(seconds * rate)).astype(np.float64)


def lowpass(signal: np.ndarray, cutoff_hz: float, rate: int = RATE) -> np.ndarray:
    """Brick-wall lowpass — an encoder's edge, exaggerated."""
    spectrum = np.fft.rfft(signal)
    freqs = np.fft.rfftfreq(signal.size, 1 / rate)
    spectrum[freqs > cutoff_hz] = 0
    return np.fft.irfft(spectrum, n=signal.size)


def fade(signal: np.ndarray, knee_hz: float, span_hz: float = 3000.0,
         rate: int = RATE) -> np.ndarray:
    """Gentle rolloff — a tape, not a filter.

    The distinction this whole module turns on: a cassette transfer and a
    128 kbps transcode can have identical bandwidth and completely different
    edges.
    """
    spectrum = np.fft.rfft(signal)
    freqs = np.fft.rfftfreq(signal.size, 1 / rate)
    over = np.maximum(freqs - knee_hz, 0) / span_hz
    return np.fft.irfft(spectrum * 10 ** (-3 * over), n=signal.size)


class TestFindCutoff:
    @pytest.mark.parametrize("cutoff", [16_000, 19_000, 20_000])
    def test_measures_an_imposed_cutoff(self, cutoff):
        spectrum = find_cutoff(lowpass(noise(), cutoff), RATE)
        # Within one FFT bin's worth of slack, plus filter skirt.
        assert abs(spectrum.cutoff_hz - cutoff) < 400

    def test_full_bandwidth_noise_reaches_nyquist(self):
        spectrum = find_cutoff(noise(), RATE)
        assert spectrum.ratio > 0.97

    def test_reports_nyquist_for_the_sample_rate(self):
        assert find_cutoff(noise(rate=96_000), 96_000).nyquist_hz == 48_000

    def test_measures_a_sharp_edge_as_narrow(self):
        # The 128 kbps transcode this was calibrated against measured 0.6 kHz.
        assert find_cutoff(lowpass(noise(), 16_000), RATE).transition_khz < 2.0

    def test_measures_a_gentle_rolloff_as_wide(self):
        # Cassette-sourced qawwali in a real library measured 3.6-10.7 kHz.
        assert find_cutoff(fade(noise(), 14_000), RATE).transition_khz > 2.0

    def test_mixes_stereo_to_mono(self):
        stereo = np.column_stack([lowpass(noise(), 16_000), lowpass(noise(seed=9), 16_000)])
        assert abs(find_cutoff(stereo, RATE).cutoff_hz - 16_000) < 400

    def test_silence_does_not_divide_by_zero(self):
        spectrum = find_cutoff(np.zeros(RATE), RATE)
        assert spectrum.cutoff_hz == 0.0 and spectrum.ratio == 0.0

    def test_a_clip_shorter_than_one_frame_is_not_an_error(self):
        spectrum = find_cutoff(np.zeros(128), RATE)
        assert spectrum.cutoff_hz == spectrum.nyquist_hz

    def test_averaging_survives_a_quiet_passage(self):
        """A single frame landing on silence must not decide the verdict."""
        signal = lowpass(noise(seconds=8.0), 20_000)
        signal[RATE * 2:RATE * 4] = 0  # two seconds of nothing in the middle
        assert find_cutoff(signal, RATE).cutoff_hz > 19_000


class TestJudge:
    def test_a_sharp_cut_is_likely_a_transcode(self):
        verdict = judge(find_cutoff(lowpass(noise(), 16_000), RATE), lossless=True)
        assert verdict.confidence == "likely"
        assert "128 kbps" in verdict.reason

    def test_a_gentle_rolloff_is_only_possible(self):
        """Bandwidth-limited but fading: a tape looks exactly like this.

        Calling this a transcode would condemn every cassette transfer in a
        qawwali library, which is most of one.
        """
        verdict = judge(find_cutoff(fade(noise(), 15_000), RATE), lossless=True)
        assert verdict.confidence == "possible"
        assert "analogue" in verdict.reason

    def test_passes_genuine_lossless(self):
        assert judge(find_cutoff(noise(), RATE), lossless=True).confidence == "clean"

    def test_never_flags_a_file_that_claims_to_be_lossy(self):
        # An MP3 with a 16 kHz cutoff is an MP3 behaving normally.
        verdict = judge(find_cutoff(lowpass(noise(), 16_000), RATE), lossless=False)
        assert verdict.confidence == "clean"
        assert "as expected" in verdict.reason

    def test_hi_res_is_judged_against_its_own_nyquist(self):
        """The upsampled-CD case: 96 kHz container, 44.1 kHz content."""
        signal = lowpass(noise(rate=96_000), 21_000, rate=96_000)
        assert judge(find_cutoff(signal, 96_000), lossless=True).suspect

    def test_genuine_hi_res_passes(self):
        assert not judge(find_cutoff(noise(rate=96_000), 96_000), lossless=True).suspect

    def test_every_verdict_says_what_it_saw(self):
        for signal in [noise(), lowpass(noise(), 16_000), fade(noise(), 15_000)]:
            reason = judge(find_cutoff(signal, RATE), lossless=True).reason
            assert "kHz" in reason and len(reason) > 30

    def test_an_uncertain_verdict_says_so(self):
        verdict = judge(find_cutoff(fade(noise(), 15_000), RATE), lossless=True)
        assert "Listen before deciding" in verdict.reason

    def test_serialises_for_the_api(self):
        payload = judge(find_cutoff(noise(), RATE), lossless=True).as_dict()
        assert set(payload) == {
            "confidence", "suspect", "cutoff_hz", "nyquist_hz",
            "ratio", "transition_khz", "reason",
        }
        assert payload["confidence"] in {"clean", "possible", "likely"}


class TestThresholds:
    def test_the_cutoff_boundary_is_where_it_claims_to_be(self):
        just_under = quality.SUSPECT_CUTOFF_RATIO * 22_050 - 500
        just_over = quality.SUSPECT_CUTOFF_RATIO * 22_050 + 500
        assert judge(find_cutoff(lowpass(noise(), just_under), RATE), True).suspect
        assert not judge(find_cutoff(lowpass(noise(), just_over), RATE), True).suspect

    def test_both_signals_are_needed(self):
        """Neither measure alone separates the calibration set.

        Cutoff alone condemns every tape transfer; transition width alone
        misses everything above 128 kbps.
        """
        tape = find_cutoff(fade(noise(), 15_000), RATE)
        transcode = find_cutoff(lowpass(noise(), 16_000), RATE)
        assert tape.ratio < quality.SUSPECT_CUTOFF_RATIO
        assert transcode.ratio < quality.SUSPECT_CUTOFF_RATIO   # same on cutoff
        assert tape.transition_khz > quality.CLIFF_TRANSITION_KHZ
        assert transcode.transition_khz <= quality.CLIFF_TRANSITION_KHZ

    def test_lossless_codec_list_covers_what_we_accept(self):
        # Every lossless extension the importer accepts should be recognised
        # here, or a transcode in that container would never be checked.
        from nyx_api.importer import AUDIO_EXTENSIONS

        lossless_exts = {".flac", ".wav", ".aiff", ".aif", ".ape", ".wv", ".alac"}
        assert lossless_exts <= AUDIO_EXTENSIONS


def test_inspect_returns_none_for_a_file_ffmpeg_cannot_read(tmp_path):
    junk = tmp_path / "not-audio.flac"
    junk.write_bytes(b"this is not a FLAC file")
    assert quality.inspect(junk) is None
