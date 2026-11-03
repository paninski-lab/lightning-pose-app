"""image_formats: which frame formats the app shows and which only LP reads."""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from PIL import Image

from litpose_app.image_formats import (
    BROWSER_IMAGE_TYPES,
    FRAME_SUFFIX_PATTERN,
    LP_ONLY_IMAGE_FORMATS,
    browser_image_type,
    lp_only_format,
    lp_only_message,
)


def test_pillow_reads_every_listed_format():
    """LP opens frames with PIL, so every listed extension must be one Pillow knows."""
    known = Image.registered_extensions()
    for suffix in [*BROWSER_IMAGE_TYPES, *LP_ONLY_IMAGE_FORMATS]:
        assert suffix in known, suffix


def test_lists_do_not_overlap():
    assert not set(BROWSER_IMAGE_TYPES) & set(LP_ONLY_IMAGE_FORMATS)


def test_lookups_ignore_case():
    assert browser_image_type("labeled-data/s/img0001.JPG") == "image/jpeg"
    assert browser_image_type("img0001.tif") is None
    assert lp_only_format("labeled-data/s/img0001.TiFF") == "TIFF"
    assert lp_only_format("img0001.png") is None


def test_suffix_pattern_matches_whole_extensions():
    rx = re.compile(rf"img\d+\.({FRAME_SUFFIX_PATTERN})\Z", re.IGNORECASE)
    assert rx.fullmatch("img1.jpeg")
    assert rx.fullmatch("img1.TIFF")
    assert not rx.fullmatch("img1.txt")


# The web UI keeps its own copy of the LP-only list and message
# (web_ui/src/app/image-formats.ts). These tests keep the two the same.
_UI_FORMATS = Path(__file__).resolve().parents[2] / "web_ui/src/app/image-formats.ts"


def _ui_source() -> str:
    if not _UI_FORMATS.is_file():
        pytest.skip("web_ui source not present")
    return _UI_FORMATS.read_text(encoding="utf-8")


def test_web_ui_lp_only_formats_match():
    source = _ui_source()
    block = re.search(r"LP_ONLY_IMAGE_FORMATS[^{]*\{(.*?)\};", source, re.S)
    assert block is not None, "LP_ONLY_IMAGE_FORMATS not found in image-formats.ts"
    ui = dict(re.findall(r"'([^']+)':\s*'([^']+)'", block.group(1)))
    assert ui == LP_ONLY_IMAGE_FORMATS


def test_web_ui_lp_only_message_matches():
    source = _ui_source()
    body = re.search(r"function lpOnlyImageMessage\([^)]*\)[^{]*\{(.*?)\n\}", source, re.S)
    assert body is not None, "lpOnlyImageMessage not found in image-formats.ts"
    # The message is string literals joined with +; ${formatName} is the format.
    parts = re.findall(r"`([^`]*)`|'([^']*)'", body.group(1))
    text = "".join(a or b for a, b in parts).replace("${formatName}", "TIFF")
    assert text == lp_only_message("TIFF")
