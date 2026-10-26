"""Files route: serve every image format LP and the browser both read, in any case (#164)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient


def _url(path: Path) -> str:
    return "/app/v0/files/" + str(path).lstrip("/")


@pytest.mark.parametrize(
    ("name", "content_type"),
    [
        ("img0001.png", "image/png"),
        ("img0001.PNG", "image/png"),
        ("img0001.jpg", "image/jpeg"),
        ("img0001.JPG", "image/jpeg"),
        ("img0001.jpeg", "image/jpeg"),
        ("img0001.webp", "image/webp"),
        ("img0001.avif", "image/avif"),
        ("img0001.bmp", "image/bmp"),
        ("img0001.gif", "image/gif"),
    ],
)
def test_read_file_serves_browser_images_in_any_case(
    client: TestClient, tmp_path: Path, name: str, content_type: str
):
    image = tmp_path / name
    image.write_bytes(b"image bytes")
    resp = client.get(_url(image))
    assert resp.status_code == 200
    assert resp.content == b"image bytes"
    assert resp.headers["content-type"] == content_type
    assert "cache-control" not in resp.headers


@pytest.mark.parametrize("name", ["img0001.tif", "img0001.TIFF", "img0001.jp2"])
def test_read_file_explains_formats_only_lp_reads(
    client: TestClient, tmp_path: Path, name: str
):
    image = tmp_path / name
    image.write_bytes(b"image bytes")
    resp = client.get(_url(image))
    assert resp.status_code == 403
    assert "train in Lightning Pose but cannot be shown" in resp.json()["detail"]


@pytest.mark.parametrize("name", ["id_rsa", "secrets.txt", "config.toml"])
def test_read_file_still_refuses_other_files(
    client: TestClient, tmp_path: Path, name: str
):
    path = tmp_path / name
    path.write_text("secret")
    resp = client.get(_url(path))
    assert resp.status_code == 403
    assert "File type not supported" in resp.json()["detail"]


def test_read_file_keeps_no_cache_for_data_files(client: TestClient, tmp_path: Path):
    csv = tmp_path / "CollectedData.csv"
    csv.write_text("a,b\n")
    resp = client.get(_url(csv))
    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-cache"
