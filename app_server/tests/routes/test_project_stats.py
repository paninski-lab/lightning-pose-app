from __future__ import annotations

import os
import shutil
from pathlib import Path

import pandas as pd
import tomli_w
import yaml
import pytest
from fastapi.testclient import TestClient

def create_mock_project(
    base_path: Path, 
    name: str, 
    has_yaml: bool = True, 
    view_names: list[str] = None, 
    keypoint_names: list[str] = None,
    csv_files: list[str] = None,
    video_files: list[str] = None,
    model_subdirs: list[str] = None,
    unlabeled_sidecar_counts: dict[str, int] = None,
):
    proj_dir = base_path / name
    proj_dir.mkdir(parents=True, exist_ok=True)
    
    if has_yaml:
        yaml_data = {
            "view_names": view_names or ["view1"],
            "keypoint_names": keypoint_names or ["kp1"],
            "video_sets": {}
        }
        (proj_dir / "project.yaml").write_text(yaml.safe_dump(yaml_data))
        
    if csv_files:
        # Create a valid-ish label file CSV (2 rows, both labeled)
        df = pd.DataFrame(
            [[1, 2], [3, 4]],
            columns=pd.MultiIndex.from_tuples([
                ("scorer", "kp1", "x"),
                ("scorer", "kp1", "y"),
            ])
        )
        for f in csv_files:
            file_path = proj_dir / f
            file_path.parent.mkdir(parents=True, exist_ok=True)
            df.to_csv(file_path, index=False)
            
            # Create sidecar if requested
            if unlabeled_sidecar_counts and f in unlabeled_sidecar_counts:
                count = unlabeled_sidecar_counts[f]
                sidecar_path = file_path.with_suffix(".unlabeled.jsonl")
                with open(sidecar_path, "w") as sf:
                    for i in range(count):
                        sf.write(f'{{"frame_path": "frame_{i}.png"}}\n')
            
    if video_files:
        for f in video_files:
            file_path = proj_dir / f
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.touch()
            
    if model_subdirs:
        model_dir = proj_dir / "models"
        model_dir.mkdir(parents=True, exist_ok=True)
        for d in model_subdirs:
            subdir = model_dir / d
            subdir.mkdir(parents=True, exist_ok=True)
            # To be counted as a model, it needs a config.yaml with some content
            (subdir / "config.yaml").write_text("model_name: test")
            
    return proj_dir

def test_list_projects_with_stats_real_filesystem(override_config, tmp_path, client: TestClient):
    # 1. Setup temporary LP_SYSTEM_DIR (already done by override_config fixture)
    lp_dir = override_config.LP_SYSTEM_DIR
    
    # 2. Create several mock projects with different characteristics
    
    # Project 1: Happy Path with grouping and sidecars
    p1_dir = create_mock_project(
        tmp_path, "project1", 
        view_names=["camA", "camB"],
        keypoint_names=["nose", "tail"],
        csv_files=["CollectedData_camA.csv", "CollectedData_camB.csv", "other.csv"],
        video_files=["videos/session1_camA.mp4", "videos/session1_camB.mp4", "videos/session2_camA.mp4"],
        model_subdirs=["model1", "model2"],
        unlabeled_sidecar_counts={
            "CollectedData_camA.csv": 3,
            "CollectedData_camB.csv": 3
        }
    )
    
    # Project 2: Missing data directory
    p2_dir = tmp_path / "non_existent"
    
    # Project 3: Missing project.yaml
    p3_dir = create_mock_project(tmp_path, "project3", has_yaml=False)
    
    # Project 4: Permission Denied (simulated)
    p4_dir = create_mock_project(tmp_path, "project4")
    (p4_dir / "project.yaml").chmod(0o000)
    
    # 3. Setup projects.toml
    projects_config = {
        "p1": {"data_dir": str(p1_dir)},
        "p2": {"data_dir": str(p2_dir)},
        "p3": {"data_dir": str(p3_dir)},
        "p4": {"data_dir": str(p4_dir)},
    }
    with open(lp_dir / "projects.toml", "wb") as f:
        tomli_w.dump(projects_config, f)
        
    # 4. Call listProjects RPC
    resp = client.post("/app/v0/rpc/listProjects")
    assert resp.status_code == 200
    data = resp.json()["projects"]
    
    # Sort data by project_key for easier assertion
    data = sorted(data, key=lambda x: x["project_key"])
    
    assert len(data) == 4
    
    # Verify Project 1 (Happy Path)
    p1 = next(p for p in data if p["project_key"] == "p1")
    assert p1["stats"]["error"] is None
    assert p1["stats"]["session_count"] == 2 # session1_*, session2_*
    assert p1["stats"]["model_count"] == 2
    assert p1["stats"]["view_names"] == ["camA", "camB"]
    assert p1["stats"]["labeled_frames_count"] == 2 # 2 frames in CollectedData_*.csv
    # Grouping check for label files
    label_files_stats = {ls["name"]: ls for ls in p1["stats"]["label_files_stats"]}
    assert "CollectedData_*.csv" in label_files_stats
    assert "other.csv" in label_files_stats
    assert p1["stats"]["label_file_count"] == 2
    
    # Check frame counts for CollectedData_*.csv
    # 2 frames in CSV + 3 frames in sidecar = 5 total
    # 2 frames in CSV are labeled = 2 labeled
    mv_stats = label_files_stats["CollectedData_*.csv"]
    assert mv_stats["total_frames"] == 5
    assert mv_stats["labeled_frames"] == 2
    
    # Verify Project 2 (Missing directory)
    p2 = next(p for p in data if p["project_key"] == "p2")
    assert "does not exist" in p2["stats"]["error"]
    
    # Verify Project 3 (Missing project.yaml)
    p3 = next(p for p in data if p["project_key"] == "p3")
    assert "Could not find a project.yaml" in p3["stats"]["error"]
    
    # Verify Project 4 (Permission Denied)
    p4 = next(p for p in data if p["project_key"] == "p4")
    assert "Permission denied" in p4["stats"]["error"]

    # Cleanup: restore permissions so tmp_path can be deleted by pytest
    (p4_dir / "project.yaml").chmod(0o644)
