from fastapi.testclient import TestClient


def test_find_label_files_logic(client: TestClient, register_project):
    """A CollectedData file with a pandas scorer suffix is listed; a bad header is not.

    File Manager would mark the accepted file OK. A header that still lacks x or y
    after the suffix is removed is omitted, as is a copy under the models directory.
    """
    project_key = "test_project"
    data_dir = register_project(
        project_key, views=["camA", "camB"], keypoints=["nose", "tail"]
    )
    image = data_dir / "labeled-data" / "sess_camA" / "img0001.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"png")

    good = (
        "scorer,rick,rick.1,rick.2,rick.3\n"
        "bodyparts,nose,nose,tail,tail\n"
        "coords,x,y,x,y\n"
        "labeled-data/sess_camA/img0001.png,1,2,3,4\n"
    )
    (data_dir / "CollectedData_camA.csv").write_text(good)
    # alice has only x and bob has only y, so the suffix strip does not make a pair.
    (data_dir / "CollectedData_camB.csv").write_text(
        "scorer,alice,bob\n"
        "bodyparts,nose,nose\n"
        "coords,x,y\n"
        "labeled-data/sess_camA/img0001.png,1,2\n"
    )
    model_copy = data_dir / "models" / "CollectedData_camA.csv"
    model_copy.parent.mkdir(parents=True)
    model_copy.write_text(good)

    response = client.post(
        "/app/v0/rpc/findLabelFiles",
        json={"projectKey": project_key},
    )

    assert response.status_code == 200
    assert response.json()["labelFiles"] == ["CollectedData_camA.csv"]
