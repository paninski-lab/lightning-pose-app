"""extractFrames rejects incomplete sessions and frames already in a label file."""

from fastapi.testclient import TestClient


def _label_csv(data_dir, name: str, index: str) -> None:
    (data_dir / name).write_text(
        "scorer,s,s\n"
        "bodyparts,nose,nose\n"
        "coords,x,y\n"
        f"{index},1,2\n"
    )


def test_extract_frames_rejects_incomplete_session_views(client: TestClient, register_project):
    """A multiview session missing a camera is rejected and no frames are written."""
    data_dir = register_project("demo", views=["bot", "top"], keypoints=["nose"])
    response = client.post(
        "/app/v0/rpc/extractFrames",
        json={
            "projectKey": "demo",
            "session": {
                "views": [
                    {"viewName": "bot", "videoPath": str(data_dir / "videos" / "sess_bot.mp4")}
                ]
            },
            "labelFile": {
                "views": [
                    {"viewName": "bot", "csvPath": str(data_dir / "CollectedData_bot.csv")},
                    {"viewName": "top", "csvPath": str(data_dir / "CollectedData_top.csv")},
                ]
            },
            "method": "manual",
            "manualFrameOptions": {"frame_index_list": [0]},
        },
    )
    assert response.status_code == 422, response.text
    assert "top" in response.json()["detail"]
    assert not (data_dir / "labeled-data").exists()


def test_extract_frames_rejects_frame_already_in_label_csv(client: TestClient, register_project):
    """A center frame whose path is already a label row is not queued again."""
    data_dir = register_project("demo", views=["bot"], keypoints=["nose"])
    index = "labeled-data/sess_bot/img00000000.jpg"
    _label_csv(data_dir, "CollectedData_bot.csv", index)
    response = client.post(
        "/app/v0/rpc/extractFrames",
        json={
            "projectKey": "demo",
            "session": {
                "views": [
                    {"viewName": "bot", "videoPath": str(data_dir / "videos" / "sess_bot.mp4")}
                ]
            },
            "labelFile": {
                "views": [
                    {"viewName": "bot", "csvPath": str(data_dir / "CollectedData_bot.csv")}
                ]
            },
            "method": "manual",
            "manualFrameOptions": {"frame_index_list": [0]},
        },
    )
    assert response.status_code == 409, response.text
    assert index in response.json()["detail"]
    assert not (data_dir / "CollectedData_bot.unlabeled.jsonl").exists()


def test_extracted_frame_is_queued_with_forward_slashes(tmp_path):
    """On Windows, the queue gets labeled-data/<session>_<view>/<name>.png, not backslashes."""
    import json
    from pathlib import PureWindowsPath

    from litpose_app.tasks.extract_frames import (
        LabelFileView,
        MVLabelFile,
        _update_unlabeled_files,
    )

    csv = tmp_path / "CollectedData.csv"
    data_dir = PureWindowsPath("C:/project")
    frame = data_dir / "labeled-data" / "sess1_top" / "img00000042.png"
    assert str(frame.relative_to(data_dir)) == r"labeled-data\sess1_top\img00000042.png"

    _update_unlabeled_files(
        data_dir,  # type: ignore[arg-type]
        {"top": {42: frame}},  # type: ignore[dict-item]
        MVLabelFile(views=[LabelFileView(csvPath=csv, viewName="top")]),
    )

    lines = csv.with_suffix(".unlabeled.jsonl").read_text().splitlines()
    assert [json.loads(line)["frame_path"] for line in lines] == [
        "labeled-data/sess1_top/img00000042.png"
    ]
