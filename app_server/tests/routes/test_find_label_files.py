import pytest
from fastapi.testclient import TestClient
from pathlib import Path

def test_find_label_files_logic(client: TestClient, register_project):
    project_key = "test_project"
    data_dir = register_project(project_key)
    
    # 1. Valid label file: 3 levels of headers, has x and y for a bodypart
    # Pandas multi-index CSV format (first 3 rows are headers)
    valid_csv_content = (
        "scorer,scorer,scorer,scorer\n"
        "body1,body1,body2,body2\n"
        "x,y,x,y\n"
        "1,2,3,4\n"
    )
    valid_file = data_dir / "valid_labels.csv"
    valid_file.write_text(valid_csv_content)

    # 2. Invalid label file: Only 2 levels of headers
    invalid_csv_content_1 = (
        "scorer,scorer\n"
        "x,y\n"
        "1,2\n"
    )
    invalid_file_1 = data_dir / "invalid_labels_1.csv"
    invalid_file_1.write_text(invalid_csv_content_1)

    # 3. Invalid label file: 3 levels but missing 'y' for bodypart
    invalid_csv_content_2 = (
        "scorer,scorer\n"
        "body1,body2\n"
        "x,x\n"
        "1,2\n"
    )
    invalid_file_2 = data_dir / "invalid_labels_2.csv"
    invalid_file_2.write_text(invalid_csv_content_2)

    # 4. Valid file but in model directory (should be filtered out)
    model_dir = data_dir / "models"
    model_dir.mkdir(parents=True, exist_ok=True)
    in_model_file = model_dir / "model_labels.csv"
    in_model_file.write_text(valid_csv_content)

    response = client.post(
        "/app/v0/rpc/findLabelFiles",
        json={"projectKey": project_key}
    )
    
    assert response.status_code == 200
    label_files = response.json()["labelFiles"]
    
    # Should only contain the valid one. The paths are relative to data_dir.
    assert "valid_labels.csv" in label_files
    assert "invalid_labels_1.csv" not in label_files
    assert "invalid_labels_2.csv" not in label_files
    assert "models/model_labels.csv" not in label_files
    assert len(label_files) == 1
