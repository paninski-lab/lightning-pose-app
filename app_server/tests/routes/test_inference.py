from __future__ import annotations

import json
from pathlib import Path

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


def _collect_sse_data_lines_infer(response, max_lines: int = 5) -> list[dict]:
    """Collect up to max_lines JSON payloads from an SSE StreamingResponse.

    Unlike the videos tests, we do not wait for a terminal event here because the
    mock inference is intentionally long-running. We just capture a few snapshots.
    """
    out: list[dict] = []
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
    return out


def test_infer_model_404_when_model_missing(
    client: TestClient, tmp_path, override_config
):
    data_dir = tmp_path / "proj" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    # minimal project.yaml so other routes don't complain if accessed
    (data_dir / "project.yaml").write_text("schema_version: 1\n")

    _override_project(client.app, data_dir)

    # Model directory does not exist yet
    with client.stream(
        "GET", "/app/v0/sse/InferModel?projectKey=demo&modelRelativePath=my_model"
    ) as resp:
        assert resp.status_code == 404


def test_infer_model_sse_active_and_idempotent(
    client: TestClient, tmp_path, override_config
):
    data_dir = tmp_path / "proj" / "data"
    model_dir = data_dir / "models" / "m1"
    model_dir.mkdir(parents=True, exist_ok=True)
    # minimal project.yaml
    (data_dir / "project.yaml").write_text("schema_version: 1\n")

    _override_project(client.app, data_dir)

    qs = (
        "/app/v0/sse/InferModel?projectKey=demo&modelRelativePath=m1"
        "&videoRelativePaths=videos/camA.mp4&videoRelativePaths=videos/camB.mp4"
    )

    # First subscriber
    with client.stream("GET", qs) as resp1:
        assert resp1.status_code == 200
        payloads1 = _collect_sse_data_lines_infer(resp1, max_lines=3)

    assert len(payloads1) >= 1
    first = payloads1[0]
    # Basic shape assertions
    assert first.get("taskId")
    assert first.get("status") in {"PENDING", "ACTIVE", "DONE", "ERROR"}

    # Second subscriber should attach to same taskId for same inputs
    with client.stream("GET", qs) as resp2:
        assert resp2.status_code == 200
        payloads2 = _collect_sse_data_lines_infer(resp2, max_lines=1)

    assert len(payloads2) == 1
    assert payloads2[0].get("taskId") == first.get("taskId")


def test_infer_model_rejects_invalid_video_path_traversal(
    client: TestClient, tmp_path, override_config
):
    data_dir = tmp_path / "proj" / "data"
    model_dir = data_dir / "models" / "m2"
    model_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "project.yaml").write_text("schema_version: 1\n")

    _override_project(client.app, data_dir)

    qs = (
        "/app/v0/sse/InferModel?projectKey=demo&modelRelativePath=m2"
        "&videoRelativePaths=../escape.mp4"
    )

    with client.stream("GET", qs) as resp:
        assert resp.status_code == 400
