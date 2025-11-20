from __future__ import annotations

import io
import json
from datetime import datetime, timedelta
from pathlib import Path
import os

from fastapi.testclient import TestClient

from lightning_pose.data.datatypes import Project, ProjectConfig, ProjectPaths

from litpose_app import deps


def _override_project(app, data_dir: Path):
    """Override project_info_getter to return a dummy Project pointing to data_dir."""

    def getter():
        def _get(project_key: str) -> Project:
            return Project(
                project_key=project_key,
                paths=ProjectPaths(data_dir=data_dir),
                config=ProjectConfig(),
            )

        return _get

    app.dependency_overrides[deps.project_info_getter] = getter


def _collect_sse_data_lines(
    response, stop_on_terminal: bool = True, max_lines: int = 200
) -> list[dict]:
    """Extract JSON payloads from an SSE StreamingResponse using TestClient.stream.

    If stop_on_terminal is True, returns as soon as an event with transcodeStatus in
    {"DONE", "ERROR"} is seen. Also guards with max_lines to avoid infinite waits.
    """
    out = []
    count = 0
    for raw in response.iter_lines():
        count += 1
        if count > max_lines:
            break
        if not raw:
            continue
        if isinstance(raw, bytes):
            line = raw.decode("utf-8")
        else:
            line = raw
        if line.startswith("data: "):
            payload = json.loads(line[len("data: ") :])
            out.append(payload)
            if stop_on_terminal and payload.get("transcodeStatus") in {"DONE", "ERROR"}:
                break
    return out


def test_upload_video_success_and_status(client: TestClient, override_config, tmp_path):

    data_dir = tmp_path / "proj" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    # Create a minimal project.yaml so other routes would be happy if needed
    (data_dir / "project.yaml").write_text("schema_version: 1\n")

    _override_project(client.app, data_dir)

    # Upload
    filename = "session_camA.mp4"
    file_content = b"fake mp4 content"
    resp = client.post(
        "/app/v0/rpc/UploadVideo",
        data={
            "projectKey": "demo",
            "filename": filename,
            "should_overwrite": "false",
        },
        files={"file": (filename, io.BytesIO(file_content), "video/mp4")},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["ok"] is True

    # Status should reflect upload DONE
    status = client.post(
        "/app/v0/rpc/GetVideoStatus", json={"filename": filename}
    ).json()
    assert status["uploadStatus"] == "DONE"
    assert status["transcodeStatus"] in {"PENDING", "ACTIVE", "DONE", "ERROR"}

    # File should exist in uploads dir
    uploads = override_config.UPLOADS_DIR
    assert (uploads / filename).exists()


def test_upload_conflict_and_overwrite(client: TestClient, override_config, tmp_path):

    data_dir = tmp_path / "proj" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    _override_project(client.app, data_dir)

    filename = "mysess_camA.mp4"
    payload = {
        "projectKey": "demo",
        "filename": filename,
        "should_overwrite": "false",
    }
    files = {"file": (filename, io.BytesIO(b"x"), "video/mp4")}
    r1 = client.post("/app/v0/rpc/UploadVideo", data=payload, files=files)
    assert r1.status_code == 200

    # second upload without overwrite should 409
    r2 = client.post("/app/v0/rpc/UploadVideo", data=payload, files=files)
    assert r2.status_code == 409

    # with overwrite should succeed
    payload["should_overwrite"] = "true"
    r3 = client.post("/app/v0/rpc/UploadVideo", data=payload, files=files)
    assert r3.status_code == 200


def test_transcode_sse_output_exists_returns_done(
    client: TestClient, tmp_path, override_config
):
    from litpose_app.routes import videos as videos_mod

    data_dir = tmp_path / "proj" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    _override_project(client.app, data_dir)

    filename = "sess_camB.mp4"

    # Ensure upload exists and output already present
    uploads = override_config.UPLOADS_DIR
    uploads.mkdir(parents=True, exist_ok=True)
    (uploads / filename).write_bytes(b"dummy")
    out_dir = videos_mod.videos_dir_for_project(
        Project(
            project_key="demo",
            paths=ProjectPaths(data_dir=data_dir),
            config=ProjectConfig(),
        )
    )
    (out_dir / filename).write_bytes(b"out")

    with client.stream(
        "GET",
        f"/app/v0/sse/TranscodeVideo?projectKey=demo&filename={filename}",
    ) as resp:
        assert resp.status_code == 200
        payloads = _collect_sse_data_lines(resp)

    assert len(payloads) == 1
    assert payloads[0]["transcodeStatus"] == "DONE"
    assert payloads[0]["uploadStatus"] == "DONE"


def test_transcode_sse_success_flow(
    client: TestClient, override_config, tmp_path, monkeypatch
):
    from litpose_app.routes import videos as videos_mod

    data_dir = tmp_path / "proj" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    _override_project(client.app, data_dir)

    filename = "run_camA.mp4"
    # Create an uploaded file manually and mark upload DONE (avoid multipart dep)
    uploads = videos_mod.uploads_dir(override_config)
    uploads.mkdir(parents=True, exist_ok=True)
    (uploads / filename).write_bytes(b"content")
    videos_mod.set_status(filename, uploadStatus="DONE")

    # Mock ffprobe to return a small total frame count
    def fake_run(cmd, stdout=None, stderr=None, text=None):
        class R:
            returncode = 0
            stdout = "42\n"

        return R()

    monkeypatch.setattr(videos_mod, "_ffprobe_total_frames", lambda p: 42)

    # Mock ffmpeg Popen to emit a couple of frame lines and succeed
    out_dir = data_dir / "videos"
    out_dir.mkdir(parents=True, exist_ok=True)

    class FakePopen:
        def __init__(self, cmd, stdout=None, stderr=None, text=None):
            self.cmd = cmd
            # Create the output file immediately to simulate ffmpeg success
            output_path = Path(cmd[-1])
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(b"ok")
            self._stderr_lines = iter(
                ["frame=    5\n", "frame=   10\n"]
            )  # simulate progress
            self.returncode = 0

        @property
        def stderr(self):
            # Provide an iterator interface
            return self

        def __iter__(self):
            return self

        def __next__(self):
            return next(self._stderr_lines)

        def communicate(self):
            return ("", "done")

    import subprocess as _subprocess

    monkeypatch.setattr(_subprocess, "Popen", FakePopen)

    with client.stream(
        "GET",
        f"/app/v0/sse/TranscodeVideo?projectKey=demo&filename={filename}",
    ) as resp:
        assert resp.status_code == 200
        payloads = _collect_sse_data_lines(resp)

    # We expect multiple events and the last one to be DONE, framesDone==10
    assert payloads, "No SSE payloads received"
    assert payloads[-1]["transcodeStatus"] == "DONE"
    assert payloads[-1]["framesDone"] == 10
    # Uploaded file should have been removed
    uploads = override_config.UPLOADS_DIR
    assert not (uploads / filename).exists()


def test_transcode_sse_failure_flow(
    client: TestClient, override_config, tmp_path, monkeypatch
):
    from litpose_app.routes import videos as videos_mod

    data_dir = tmp_path / "proj" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    _override_project(client.app, data_dir)

    filename = "bad_camA.mp4"
    # Create an uploaded file manually and mark upload DONE (avoid multipart dep)
    uploads = videos_mod.uploads_dir(override_config)
    uploads.mkdir(parents=True, exist_ok=True)
    (uploads / filename).write_bytes(b"content")
    videos_mod.set_status(filename, uploadStatus="DONE")

    # ffprobe total frames unknown
    monkeypatch.setattr(videos_mod, "_ffprobe_total_frames", lambda p: None)

    class FailPopen:
        def __init__(self, cmd, stdout=None, stderr=None, text=None):
            self._stderr_lines = iter(["frame=    2\n"])  # some progress then fail
            self.returncode = 1

        @property
        def stderr(self):
            return self

        def __iter__(self):
            return self

        def __next__(self):
            return next(self._stderr_lines)

        def communicate(self):
            return ("", "error")

    import subprocess as _subprocess

    monkeypatch.setattr(_subprocess, "Popen", FailPopen)

    with client.stream(
        "GET",
        f"/app/v0/sse/TranscodeVideo?projectKey=demo&filename={filename}",
    ) as resp:
        assert resp.status_code == 200
        payloads = _collect_sse_data_lines(resp)

    assert payloads[-1]["transcodeStatus"] == "ERROR"
    # Uploaded file should NOT have been removed on error
    uploads = override_config.UPLOADS_DIR

    assert (uploads / filename).exists()


def test_startup_cleanup_removes_old_uploads(override_config, tmp_path, monkeypatch):
    from litpose_app.routes import videos as videos_mod

    uploads = override_config.UPLOADS_DIR
    uploads.mkdir(parents=True, exist_ok=True)

    old_file = uploads / "old_camC.mp4"
    new_file = uploads / "new_camC.mp4"
    old_file.write_bytes(b"x")
    new_file.write_bytes(b"y")

    # Set mtime of old_file to >24h ago
    old_time = datetime.now() - timedelta(hours=25)
    new_time = datetime.now()

    for p, t in [(old_file, old_time), (new_file, new_time)]:
        atime = t.timestamp()
        mtime = t.timestamp()
        Path(p).touch()
        os.utime(p, (atime, mtime))

    # Call the cleanup function
    videos_mod.cleanup_old_uploads(override_config)

    assert not old_file.exists()
    assert new_file.exists()
