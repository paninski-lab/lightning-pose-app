"""countLabeledFrames: frame rows in a label CSV, counted as LP reads them."""

from fastapi.testclient import TestClient

HEADER = "scorer,rick,rick,rick,rick\nbodyparts,nose,nose,tail,tail\ncoords,x,y,x,y\n"


def _count(client: TestClient, project_key: str, csv_path: str):
    return client.post(
        "/app/v0/rpc/countLabeledFrames",
        json={"projectKey": project_key, "csvPath": csv_path},
    )


def test_counts_rows_including_an_empty_first_row(client: TestClient, register_project):
    data_dir = register_project("p", views=[], keypoints=["nose", "tail"])
    # pandas drops an all-empty first row; LP puts it back and trains on it.
    (data_dir / "CollectedData.csv").write_text(
        HEADER
        + "labeled-data/s/img0.png,,,,\n"
        + "labeled-data/s/img1.png,1,2,3,4\n"
        + "labeled-data/s/img2.png,1,2,,\n"
    )

    absolute = _count(client, "p", str(data_dir / "CollectedData.csv"))
    relative = _count(client, "p", "CollectedData.csv")

    assert absolute.status_code == 200
    assert absolute.json() == {"labeledFrames": 3}
    assert relative.json() == {"labeledFrames": 3}


def test_refuses_a_csv_outside_the_data_dir(client: TestClient, register_project, tmp_path):
    register_project("p", views=[], keypoints=["nose", "tail"])
    outside = tmp_path / "elsewhere.csv"
    outside.write_text(HEADER + "img.png,1,2,3,4\n")

    response = _count(client, "p", "../../elsewhere.csv")

    assert response.status_code == 400
    assert "not inside the project's data directory" in response.json()["detail"]
