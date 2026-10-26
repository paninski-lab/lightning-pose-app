"""Image formats for labeled frames: which ones the app can show, and which only LP can read.

LP opens labeled frames with PIL, so it trains on any format Pillow reads.
The app shows frames in the browser, which reads fewer formats. Extensions
are matched in any letter case.
"""

from __future__ import annotations

from pathlib import Path

# Pillow and Chrome both read these. Values are the Content-Type to serve.
BROWSER_IMAGE_TYPES: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".jfif": "image/jpeg",
    ".png": "image/png",
    ".apng": "image/apng",
    ".bmp": "image/bmp",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
}

# Pillow reads these, so LP trains on them, but the browser cannot show them.
# Values name the format in messages.
LP_ONLY_IMAGE_FORMATS: dict[str, str] = {
    ".tif": "TIFF",
    ".tiff": "TIFF",
    ".ppm": "PPM",
    ".pgm": "PGM",
    ".pbm": "PBM",
    ".pnm": "PNM",
    ".tga": "TGA",
    ".jp2": "JPEG 2000",
    ".j2k": "JPEG 2000",
}

FRAME_IMAGE_SUFFIXES = frozenset(BROWSER_IMAGE_TYPES) | frozenset(LP_ONLY_IMAGE_FORMATS)

# For regexes that match a frame file name: "png|jpg|...", longest first.
FRAME_SUFFIX_PATTERN = "|".join(
    s.lstrip(".") for s in sorted(FRAME_IMAGE_SUFFIXES, key=len, reverse=True)
)


def image_suffix(path: Path | str) -> str:
    """Return the lowercase suffix of path, e.g. '.jpg' for 'img001.JPG'."""
    return Path(path).suffix.lower()


def browser_image_type(path: Path | str) -> str | None:
    """Return the Content-Type for an image the browser can show, else None."""
    return BROWSER_IMAGE_TYPES.get(image_suffix(path))


def lp_only_format(path: Path | str) -> str | None:
    """Return the format name ('TIFF', ...) when only LP can read the image, else None."""
    return LP_ONLY_IMAGE_FORMATS.get(image_suffix(path))


def lp_only_message(format_name: str) -> str:
    """Explain that frames in this format train in LP but cannot be shown in the app."""
    return (
        f"{format_name} frames train in Lightning Pose but cannot be shown in the "
        "browser. Convert them to PNG to label or review them here."
    )
