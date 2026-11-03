"""Project default model config, bundled defaults, and LP's recommended settings (#190)."""

from __future__ import annotations

import json
import subprocess
import sys
import types
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient
from omegaconf import OmegaConf

import litpose_app
from litpose_app.routes import configs

_PACKAGE = Path(litpose_app.__file__).parent


def _single_view(data_dir: Path) -> None:
    (data_dir / "project.yaml").write_text(
        yaml.safe_dump({"view_names": [], "keypoint_names": ["nose"]})
    )


# -----------------------------
# Bundled defaults
# -----------------------------


@pytest.mark.parametrize("name", ["config_default.yaml", "config_default_multiview.yaml"])
def test_bundled_default_matches_lp_values_and_loads(name):
    """LP 2.4.4's values, 256x256 images, and no Hydra-only ${now:} interpolations."""
    cfg = OmegaConf.to_container(OmegaConf.load(_PACKAGE / name), resolve=True)
    assert cfg["data"]["image_resize_dims"] == {"height": 256, "width": 256}
    assert cfg["training"]["imgaug_hflip"] is False
    assert cfg["training"]["early_stopping"] is False
    for loss in ("temporal", "pca_singleview", "pca_multiview"):
        assert cfg["losses"][loss]["log_weight"] == 11.0
    assert "hydra" not in cfg


# -----------------------------
# Project default config
# -----------------------------


def _write_default(client: TestClient):
    return client.post("/app/v0/rpc/writeDefaultModelConfig", json={"projectKey": "p"})


def test_write_default_model_config_single_view(client, register_project):
    data_dir = register_project("p")
    _single_view(data_dir)

    resp = _write_default(client)

    assert resp.status_code == 200, resp.text
    written = data_dir / "configs" / "default.yaml"
    assert resp.json()["path"] == str(written)
    assert written.read_bytes() == (_PACKAGE / "config_default.yaml").read_bytes()


def test_write_default_model_config_multiview(client, register_project):
    data_dir = register_project("p", views=["top", "bot"])

    assert _write_default(client).status_code == 200

    written = data_dir / "configs" / "default.yaml"
    assert written.read_bytes() == (_PACKAGE / "config_default_multiview.yaml").read_bytes()


def test_write_default_model_config_never_overwrites(client, register_project):
    data_dir = register_project("p")
    existing = data_dir / "configs" / "default.yaml"
    existing.parent.mkdir()
    existing.write_text("training: {max_epochs: 7}\n")

    resp = _write_default(client)

    assert resp.status_code == 409
    assert existing.read_text() == "training: {max_epochs: 7}\n"


def test_create_new_project_keeps_an_existing_default_config(
    client: TestClient, override_config, tmp_path
):
    override_config.PROJECTS_TOML_PATH.unlink(missing_ok=True)
    data_dir = tmp_path / "lp_project"
    existing = data_dir / "configs" / "default.yaml"
    existing.parent.mkdir(parents=True)
    existing.write_text("training: {max_epochs: 7}\n")

    resp = client.post(
        "/app/v0/rpc/CreateNewProject",
        json={
            "projectKey": "lp-project",
            "data_dir": str(data_dir),
            "projectInfo": {"views": [], "keypoint_names": ["nose"]},
        },
    )

    assert resp.status_code == 200, resp.text
    assert existing.read_text() == "training: {max_epochs: 7}\n"


# -----------------------------
# Recommended settings route
# -----------------------------


def _recommend(client: TestClient, **body):
    return client.post(
        "/app/v0/rpc/recommendModelConfig", json={"projectKey": "p", **body}
    )


def test_recommend_runs_the_script_for_the_chosen_label_file(
    client, register_project, monkeypatch
):
    data_dir = register_project("p", views=["top", "bot"])
    calls: list[list[str]] = []
    result = {"recommendation": {"backbone": "vits_dino"}, "gpu": None}

    def fake_run(cmd, **_kwargs):
        calls.append(cmd)
        return subprocess.CompletedProcess(cmd, 0, "log line\n" + json.dumps(result), "")

    monkeypatch.setattr(configs.subprocess, "run", fake_run)
    resp = _recommend(
        client,
        csvPaths=["Other_top.csv", str(data_dir / "Other_bot.csv")],
        viewNames=["top", "bot"],
        videosDir="videos_labeled",
        topDownFreelyMoving=True,
    )

    assert resp.status_code == 200, resp.text
    assert resp.json() == result
    cmd = calls[0]
    assert cmd[0] == sys.executable
    csvs = cmd[cmd.index("--csv") + 1 : cmd.index("--views")]
    assert csvs == [str(data_dir / "Other_top.csv"), str(data_dir / "Other_bot.csv")]
    assert cmd[cmd.index("--views") + 1 : cmd.index("--video_dir")] == ["top", "bot"]
    assert cmd[cmd.index("--video_dir") + 1] == str((data_dir / "videos_labeled").resolve())
    assert "--top_down_freely_moving" in cmd


def test_recommend_refuses_files_outside_the_project(client, register_project, monkeypatch):
    register_project("p")
    monkeypatch.setattr(configs.subprocess, "run", pytest.fail)

    assert _recommend(client, csvPaths=["/etc/passwd"]).status_code == 400
    assert _recommend(client, csvPaths=["a.csv"], videosDir="../x").status_code == 400


def test_recommend_reports_the_script_error(client, register_project, monkeypatch):
    register_project("p")

    def fake_run(cmd, **_kwargs):
        return subprocess.CompletedProcess(
            cmd, 1, "", "Traceback...\nFileNotFoundError: labeled image not found: x.png\n"
        )

    monkeypatch.setattr(configs.subprocess, "run", fake_run)
    resp = _recommend(client, csvPaths=["CollectedData_camA.csv"])

    assert resp.status_code == 400
    assert "labeled image not found" in resp.json()["detail"]


# -----------------------------
# The script, against a stand-in for LP's recommender
# -----------------------------


def test_script_sets_the_label_files_views_and_videos(tmp_path, monkeypatch, capsys):
    """CI has no LP: a stand-in recommender records what the script passes it."""
    from dataclasses import dataclass, field

    from litpose_app.scripts import recommend_config

    @dataclass
    class Analysis:
        csv_paths: list
        view_names: list | None
        video_dir: Path
        has_videos: bool
        n_frames: int = 40
        image_height: int = 200
        image_width: int = 300

    @dataclass
    class Rec:
        backbone: str = "vits_dino"
        rationale: dict = field(default_factory=dict)

    seen: dict = {}

    def recommend(analysis, gpu, top_down_freely_moving=False):
        seen.update(analysis=analysis, top_down=top_down_freely_moving)
        return Rec()

    fake = types.ModuleType("lightning_pose.utils.recommender")
    fake.analyze_dataset = lambda path: Analysis([path], None, tmp_path / "videos", False)
    fake.get_gpu_info = lambda: None
    fake.recommend = recommend
    utils = types.ModuleType("lightning_pose.utils")
    utils.recommender = fake
    monkeypatch.setitem(sys.modules, "lightning_pose", types.ModuleType("lightning_pose"))
    monkeypatch.setitem(sys.modules, "lightning_pose.utils", utils)
    monkeypatch.setitem(sys.modules, "lightning_pose.utils.recommender", fake)

    videos = tmp_path / "videos_labeled"
    videos.mkdir()
    (videos / "s1_top.mp4").write_bytes(b"")
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "recommend_config.py",
            "--csv", "a_top.csv", "a_bot.csv",
            "--views", "top", "bot",
            "--video_dir", str(videos),
        ],
    )

    recommend_config.main()

    analysis = seen["analysis"]
    assert analysis.csv_paths == [Path("a_top.csv"), Path("a_bot.csv")]
    assert analysis.view_names == ["top", "bot"]
    assert analysis.video_dir == videos and analysis.has_videos is True
    out = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert out["recommendation"]["backbone"] == "vits_dino"
    assert out["labeledFrames"] == 40
