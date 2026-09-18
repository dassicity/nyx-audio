"""Static checks on the Dockerfile.

The image is built on the Pi, not in CI, so a mistake here surfaces as a
failed deploy several minutes into a build. These catch the ones that have
already happened once.
"""
from __future__ import annotations

from pathlib import Path

DOCKERFILE = Path(__file__).resolve().parent.parent / "Dockerfile"


def instructions() -> list[tuple[int, str, str]]:
    """(line, INSTRUCTION, argument) for each instruction, joining continuations."""
    out: list[tuple[int, str, str]] = []
    buffer, start = "", 0
    for number, raw in enumerate(DOCKERFILE.read_text().splitlines(), 1):
        line = raw.rstrip()
        if not buffer and (not line.strip() or line.lstrip().startswith("#")):
            continue
        if not buffer:
            start = number
        buffer += line.rstrip("\\") + " "
        if not line.endswith("\\"):
            op, _, arg = buffer.strip().partition(" ")
            out.append((start, op.upper(), arg))
            buffer = ""
    return out


def test_nothing_writes_config_after_dropping_privileges():
    """COPY creates /config owned by root whatever USER says, so any RUN that
    writes into it must come before USER. This failed a real deploy with
    EACCES when the interactive config was generated after `USER 1000`.
    """
    ops = instructions()
    user_line = next(line for line, op, _ in ops if op == "USER")
    late = [
        (line, arg[:60])
        for line, op, arg in ops
        if op == "RUN" and "/config" in arg and line > user_line
    ]
    assert late == [], f"RUN writing /config after USER (line {user_line}): {late}"


def test_the_image_does_not_run_as_root():
    ops = instructions()
    users = [arg.strip() for _, op, arg in ops if op == "USER"]
    assert users and users[-1] not in {"0", "root"}


def test_the_commit_stamp_comes_late():
    """A new commit should invalidate only the cheap tail of the build, not
    the apt and dependency layers that take minutes on a Pi."""
    ops = instructions()
    arg_line = next(line for line, op, a in ops if op == "ARG" and "NYX_COMMIT" in a)
    heavy = [line for line, op, a in ops if op == "RUN" and ("apt-get" in a or "uv sync" in a)]
    assert all(line < arg_line for line in heavy)


def test_both_beets_configs_are_installed():
    text = DOCKERFILE.read_text()
    assert "/config/beets.yaml" in text
    assert "/config/interactive.yaml" in text
