import os
import shutil
from pathlib import Path
import pytest
import yaml
import tomli_w
from litpose_app import deps
from litpose_app.rootconfig import RootConfig
from litpose_app.project import ProjectUtil
from litpose_app.config import Config

def test_project_info_getter_creates_yaml_from_template(tmp_path, override_config: RootConfig):
    # Setup temporary "repo" environment
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    
    # 1. Create a "template" YAML somewhere in the "repo"
    template_yaml = repo_root / "template.yaml"
    template_content = {
        "data": {
            "view_names": ["view1", "view2"],
            "keypoint_names": ["kp1", "kp2"]
        }
    }
    with open(template_yaml, "w") as f:
        yaml.dump(template_content, f)
        
    # 2. Setup project without project.yaml
    project_data_dir = tmp_path / "my_project" / "data"
    project_data_dir.mkdir(parents=True)
    
    # Update projects.toml via project_util
    project_util = deps.project_util(override_config)
    from litpose_app.datatypes import ProjectPaths
    project_util.update_project_paths("test_project", ProjectPaths(data_dir=project_data_dir))
    
    app_config = Config()
    # Use environment variable to point to our mock repo root
    os.environ["REPO_ROOT"] = str(repo_root)
    
    try:
        # Get the getter
        getter = deps.project_info_getter(project_util, app_config)
        
        # 3. Call it
        project = getter("test_project")
        
        # 4. Verify
        assert project.project_key == "test_project"
        assert (project_data_dir / "project.yaml").exists()
        
        with open(project_data_dir / "project.yaml", "r") as f:
            created_data = yaml.safe_load(f)
        
        assert created_data["view_names"] == ["view1", "view2"]
        assert created_data["keypoint_names"] == ["kp1", "kp2"]
    finally:
        # Cleanup env var
        if "REPO_ROOT" in os.environ:
            del os.environ["REPO_ROOT"]

def test_project_info_getter_fails_when_no_template_found(tmp_path, override_config: RootConfig):
    # Setup empty "repo" environment
    repo_root = tmp_path / "repo_empty"
    repo_root.mkdir()
    
    # Setup project without project.yaml
    project_data_dir = tmp_path / "my_project_fail" / "data"
    project_data_dir.mkdir(parents=True)
    
    project_util = deps.project_util(override_config)
    from litpose_app.datatypes import ProjectPaths
    project_util.update_project_paths("fail_project", ProjectPaths(data_dir=project_data_dir))
    
    app_config = Config()
    os.environ["REPO_ROOT"] = str(repo_root)
    
    try:
        getter = deps.project_info_getter(project_util, app_config)
        
        with pytest.raises(deps.ApplicationError) as excinfo:
            getter("fail_project")
        
        assert "Could not find a project.yaml file in data directory." in str(excinfo.value)
    finally:
        if "REPO_ROOT" in os.environ:
            del os.environ["REPO_ROOT"]

def test_project_info_getter_fails_when_data_dir_missing(tmp_path, override_config: RootConfig):
    # Setup project with a non-existent data directory
    project_data_dir = tmp_path / "missing_data_dir"
    # DO NOT create project_data_dir
    
    project_util = deps.project_util(override_config)
    from litpose_app.datatypes import ProjectPaths
    project_util.update_project_paths("missing_project", ProjectPaths(data_dir=project_data_dir))
    
    app_config = Config()
    
    getter = deps.project_info_getter(project_util, app_config)
    
    with pytest.raises(deps.ApplicationError) as excinfo:
        getter("missing_project")
    
    assert "Data directory" in str(excinfo.value)
    assert "does not exist." in str(excinfo.value)
    assert "project.yaml" not in str(excinfo.value)
