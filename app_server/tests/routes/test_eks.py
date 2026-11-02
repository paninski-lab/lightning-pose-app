"""EKS models: linear for every project, nonlinear for multiview projects with calibration."""

from __future__ import annotations

from pathlib import Path

import yaml

from litpose_app.datatypes import Project, ProjectConfig, ProjectPaths
from litpose_app.routes import inference
from litpose_app.routes.inference import (
    InferStep,
    _build_infer_plan,
    _eks_command,
    _eks_input_files,
    _run_steps,
)


def _single_view(data_dir: Path) -> None:
    (data_dir / "project.yaml").write_text(
        yaml.safe_dump({"view_names": [], "keypoint_names": ["nose"]})
    )


def _create(client, smoother: str, view_names: list[str], name: str = "eks"):
    return client.post(
        "/app/v0/rpc/createEksModel",
        json={
            "projectKey": "p",
            "modelName": name,
            "members": [{"id": "m1"}],
            "view_names": view_names,
            "smoother": smoother,
        },
    )


def _calibration(path: Path, cameras: list[str]) -> Path:
    """Write a calibration CameraGroup can load, with these camera names in order."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(
            f'[cam_{idx}]\nname = "{cam}"\n'
            "size = [100, 80]\n"
            "matrix = [[1.0, 0.0, 50.0], [0.0, 1.0, 40.0], [0.0, 0.0, 1.0]]\n"
            "distortions = [0.0, 0.0, 0.0, 0.0, 0.0]\n"
            "rotation = [0.0, 0.0, 0.0]\n"
            "translation = [0.0, 0.0, 1.0]\n\n"
            for idx, cam in enumerate(cameras)
        )
    )
    return path


def _ensemble(data_dir: Path, name: str = "eks") -> dict:
    return yaml.safe_load((data_dir / "models" / name / "ensemble.yaml").read_text())


# -----------------------------
# Creating EKS models
# -----------------------------


def test_single_view_project_can_create_linear_eks(client, register_project):
    data_dir = register_project("p")
    _single_view(data_dir)
    assert _create(client, "linear", []).status_code == 200
    assert _ensemble(data_dir)["smoother"] == "linear"


def test_nonlinear_refused_for_single_view_project(client, register_project):
    data_dir = register_project("p")
    _single_view(data_dir)
    (data_dir / "calibration.toml").write_text("")
    resp = _create(client, "nonlinear", [])
    assert resp.status_code == 400
    assert "multiview" in resp.json()["detail"]
    assert not (data_dir / "models" / "eks").exists()


def test_nonlinear_refused_without_calibration(client, register_project):
    data_dir = register_project("p")
    resp = _create(client, "nonlinear", ["camA", "camB"])
    assert resp.status_code == 400
    assert "calibration" in resp.json()["detail"]
    assert not (data_dir / "models" / "eks").exists()


def test_nonlinear_allowed_with_only_a_session_calibration(client, register_project):
    data_dir = register_project("p")
    (data_dir / "calibrations").mkdir()
    (data_dir / "calibrations" / "s1.toml").write_text("")
    assert _create(client, "nonlinear", ["camA", "camB"]).status_code == 200
    assert _ensemble(data_dir)["smoother"] == "nonlinear"


# -----------------------------
# Inference plan and command line
# -----------------------------


def _project(data_dir: Path, views: list[str]) -> Project:
    return Project(
        project_key="p",
        paths=ProjectPaths(data_dir=data_dir),
        config=ProjectConfig(view_names=views),
    )


def _eks_model(data_dir: Path, views: list[str], smoother: str | None) -> None:
    eks_dir = data_dir / "models" / "eks"
    eks_dir.mkdir(parents=True)
    config = {"members": [{"id": "m1"}], "view_names": views}
    if smoother is not None:
        config["smoother"] = smoother
    (eks_dir / "ensemble.yaml").write_text(yaml.safe_dump(config))


def _eks_steps(project: Project, sessions: list[str]) -> dict[str, InferStep]:
    plan = _build_infer_plan(project, ["eks"], sessions)
    return {s.session: s for s in plan.steps if s.kind == "eks"}


def _arg(cmd: list[str], flag: str) -> str | None:
    return cmd[cmd.index(flag) + 1] if flag in cmd else None


def test_nonlinear_uses_session_calibration_then_project_file(register_project):
    data_dir = register_project("p")
    (data_dir / "calibrations").mkdir()
    session_cal = data_dir / "calibrations" / "s1.toml"
    session_cal.write_text("")
    project_cal = data_dir / "calibration.toml"
    project_cal.write_text("")
    _eks_model(data_dir, ["camA", "camB"], "nonlinear")

    steps = _eks_steps(_project(data_dir, ["camA", "camB"]), ["s1", "s2"])
    cmd1 = _eks_command(steps["s1"], _eks_input_files(steps["s1"]))
    cmd2 = _eks_command(steps["s2"], _eks_input_files(steps["s2"]))
    assert _arg(cmd1, "--calibration") == str(session_cal)
    assert _arg(cmd2, "--calibration") == str(project_cal)
    assert _arg(cmd1, "--save_3d_dir") == str(data_dir / "models" / "eks" / "video_preds_3d")


def test_linear_and_older_ensemble_yaml_pass_no_calibration(register_project):
    data_dir = register_project("p")
    (data_dir / "calibration.toml").write_text("")
    # ensemble.yaml written before the smoother choice existed
    _eks_model(data_dir, ["camA", "camB"], None)

    step = _eks_steps(_project(data_dir, ["camA", "camB"]), ["s1"])["s1"]
    cmd = _eks_command(step, _eks_input_files(step))
    assert "--calibration" not in cmd
    assert cmd[cmd.index("--camera_names") + 1 : cmd.index("--camera_names") + 3] == [
        "camA",
        "camB",
    ]


def test_single_view_eks_reads_session_csv_without_camera_names(register_project):
    data_dir = register_project("p")
    _single_view(data_dir)
    _eks_model(data_dir, [], "linear")

    step = _eks_steps(_project(data_dir, []), ["s1"])["s1"]
    files = _eks_input_files(step)
    assert files == [data_dir / "models" / "m1" / "video_preds" / "s1.csv"]
    assert "--camera_names" not in _eks_command(step, files)


def _member_preds(data_dir: Path, sessions: list[str], cams: list[str]) -> None:
    preds = data_dir / "models" / "m1" / "video_preds"
    preds.mkdir(parents=True, exist_ok=True)
    for session in sessions:
        for cam in cams:
            (preds / f"{session}_{cam}.csv").write_text("")


def test_sessions_without_calibration_are_listed_after_inference(
    register_project, monkeypatch
):
    data_dir = register_project("p")
    _calibration(data_dir / "calibrations" / "s1.toml", ["camA", "camB"])
    _eks_model(data_dir, ["camA", "camB"], "nonlinear")
    _member_preds(data_dir, ["s1", "s2", "s3"], ["camA", "camB"])

    steps = list(_eks_steps(_project(data_dir, ["camA", "camB"]), ["s1", "s2", "s3"]).values())
    ran: list[list[str]] = []
    monkeypatch.setattr(
        inference, "_run_subprocess_with_logging", lambda _task, cmd: ran.append(cmd) or 0
    )

    task_id = "eks-no-calibration"
    _run_steps(task_id, steps, len(steps))

    # Only s1 has a calibration; s2 and s3 are skipped, not failed.
    assert len(ran) == 1 and _arg(ran[0], "--calibration").endswith("s1.toml")
    status = inference._status_snapshot_dict(task_id)
    assert status["status"] == inference.InferenceStatus.COMPLETED
    assert status["error"] is None
    assert "2 sessions" in status["message"]
    logs = status["logs"]
    listed = logs.index(next(line for line in logs if "did not run on these sessions" in line))
    assert logs[listed + 1] == "eks: s2, s3"


def test_calibration_with_other_camera_order_fails_the_session(register_project, monkeypatch):
    data_dir = register_project("p")
    # same cameras, other order: EKS would silently pair each view with the wrong camera
    _calibration(data_dir / "calibrations" / "s1.toml", ["camB", "camA"])
    _calibration(data_dir / "calibration.toml", ["camA", "camB"])
    _eks_model(data_dir, ["camA", "camB"], "nonlinear")
    _member_preds(data_dir, ["s1", "s2"], ["camA", "camB"])

    steps = list(_eks_steps(_project(data_dir, ["camA", "camB"]), ["s1", "s2"]).values())
    ran: list[list[str]] = []
    monkeypatch.setattr(
        inference, "_run_subprocess_with_logging", lambda _task, cmd: ran.append(cmd) or 0
    )

    task_id = "eks-camera-mismatch"
    _run_steps(task_id, steps, len(steps))

    # s1 does not run; s2 uses calibration.toml, whose names match.
    assert len(ran) == 1 and _arg(ran[0], "--calibration").endswith("calibration.toml")
    status = inference._status_snapshot_dict(task_id)
    assert status["status"] == inference.InferenceStatus.COMPLETED
    assert "s1" in status["error"]
    assert any("s1.toml" in line and "camA, camB" in line for line in status["logs"])
