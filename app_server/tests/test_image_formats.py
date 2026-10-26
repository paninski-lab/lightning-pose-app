"""image_formats: which frame formats the app shows and which only LP reads."""

from __future__ import annotations

import re

from PIL import Image

from litpose_app.image_formats import (
    BROWSER_IMAGE_TYPES,
    FRAME_SUFFIX_PATTERN,
    LP_ONLY_IMAGE_FORMATS,
    browser_image_type,
    lp_only_format,
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
