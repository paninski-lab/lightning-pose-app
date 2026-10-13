"""GetGlobalContext reports environment flags the navbar uses for warnings."""

from __future__ import annotations

import shutil
import sys

from fastapi.testclient import TestClient


def test_get_global_context_reports_ffmpeg_and_windows(
    client: TestClient, monkeypatch
):
    monkeypatch.setattr(sys, "platform", "linux")
    monkeypatch.setattr(shutil, "which", lambda _name: "/usr/bin/ffmpeg")
    available = client.post("/app/v0/rpc/GetGlobalContext")
    assert available.status_code == 200
    assert available.json()["ffmpegAvailable"] is True
    assert available.json()["nativeWindows"] is False

    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setattr(shutil, "which", lambda _name: None)
    missing = client.post("/app/v0/rpc/GetGlobalContext")
    assert missing.status_code == 200
    assert missing.json()["ffmpegAvailable"] is False
    assert missing.json()["nativeWindows"] is True
