"""Delete one model folder only after the typed path matches."""

from fastapi.testclient import TestClient


def test_delete_model_requires_typed_path_and_stays_inside_model_dir(
    client: TestClient, register_project
):
    """A wrong confirmation leaves the folder, and a path outside the model directory is refused.

    The matching confirmation removes only that model folder.
    """
    data_dir = register_project("demo")
    model = data_dir / "models" / "model_0"
    model.mkdir(parents=True)
    (model / "config.yaml").write_text("model: 0\n")
    kept = data_dir / "models" / "model_1"
    kept.mkdir()
    (kept / "config.yaml").write_text("model: 1\n")
    outside = data_dir / "outside"
    outside.mkdir()
    (outside / "marker.txt").write_text("stay\n")

    wrong = client.post(
        "/app/v0/rpc/deleteModel",
        json={
            "projectKey": "demo",
            "modelRelativePath": "model_0",
            "confirmModelPath": "model_1",
        },
    )
    assert wrong.status_code == 400, wrong.text
    assert (model / "config.yaml").is_file()

    escaped = client.post(
        "/app/v0/rpc/deleteModel",
        json={
            "projectKey": "demo",
            "modelRelativePath": "../outside",
            "confirmModelPath": "../outside",
        },
    )
    assert escaped.status_code == 400, escaped.text
    assert (outside / "marker.txt").is_file()
    assert model.is_dir()

    deleted = client.post(
        "/app/v0/rpc/deleteModel",
        json={
            "projectKey": "demo",
            "modelRelativePath": "model_0",
            "confirmModelPath": "model_0",
        },
    )
    assert deleted.status_code == 200, deleted.text
    assert not model.exists()
    assert (kept / "config.yaml").is_file()
    assert (outside / "marker.txt").is_file()
