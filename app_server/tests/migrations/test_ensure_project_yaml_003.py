import yaml
import pytest
from pathlib import Path
from litpose_app.datatypes import ProjectPaths
from litpose_app.migrations.ensure_project_yaml_003 import needs_migration, migrate

def test_needs_migration_when_missing(tmp_path):
    paths = ProjectPaths(data_dir=tmp_path)
    assert needs_migration(paths) is True

def test_needs_migration_when_invalid(tmp_path):
    paths = ProjectPaths(data_dir=tmp_path)
    project_yaml = tmp_path / "project.yaml"
    project_yaml.write_text(yaml.dump({"something": "else"}))
    assert needs_migration(paths) is False

def test_needs_migration_when_valid(tmp_path):
    paths = ProjectPaths(data_dir=tmp_path)
    project_yaml = tmp_path / "project.yaml"
    project_yaml.write_text(yaml.dump({
        "view_names": ["v1"],
        "keypoint_names": ["kp1"]
    }))
    assert needs_migration(paths) is False

def test_migrate_from_template(tmp_path):
    paths = ProjectPaths(data_dir=tmp_path)
    
    # Create template
    template = tmp_path / "config.yaml"
    template.write_text(yaml.dump({
        "data": {
            "view_names": ["v1", "v2"],
            "keypoint_names": ["kp1", "kp2"]
        }
    }))
    
    migrate(paths)
    
    project_yaml = tmp_path / "project.yaml"
    assert project_yaml.exists()
    with open(project_yaml, "r") as f:
        data = yaml.safe_load(f)
        assert data["view_names"] == ["v1", "v2"]
        assert data["keypoint_names"] == ["kp1", "kp2"]
        assert data["schema_version"] == 1

def test_migrate_from_template_in_subdir(tmp_path):
    paths = ProjectPaths(data_dir=tmp_path)
    
    subdir = tmp_path / "subdir"
    subdir.mkdir()
    template = subdir / "config.yaml"
    template.write_text(yaml.dump({
        "data": {
            "view_names": ["v_sub"],
            "keypoint_names": ["kp_sub"]
        }
    }))
    
    migrate(paths)
    
    project_yaml = tmp_path / "project.yaml"
    assert project_yaml.exists()
    with open(project_yaml, "r") as f:
        data = yaml.safe_load(f)
        assert data["view_names"] == ["v_sub"]

def test_migrate_no_template_available(tmp_path, caplog):
    paths = ProjectPaths(data_dir=tmp_path)
    
    # No yaml files at all
    migrate(paths)
    
    assert not (tmp_path / "project.yaml").exists()
    assert "Could not find a suitable template" in caplog.text

def test_migrate_ignores_invalid_existing_project_yaml(tmp_path):
    paths = ProjectPaths(data_dir=tmp_path)
    project_yaml = tmp_path / "project.yaml"
    original_content = yaml.dump({"something": "else"})
    project_yaml.write_text(original_content)
    
    # Create template
    template = tmp_path / "config.yaml"
    template.write_text(yaml.dump({
        "data": {
            "view_names": ["v1", "v2"],
            "keypoint_names": ["kp1", "kp2"]
        }
    }))
    
    migrate(paths)
    
    # Content should be unchanged
    assert project_yaml.read_text() == original_content

def test_migrate_ignores_partially_invalid_data_key(tmp_path):
    paths = ProjectPaths(data_dir=tmp_path)
    
    # Yaml file with "data" key but missing required sub-keys
    bad_yaml = tmp_path / "bad.yaml"
    bad_yaml.write_text(yaml.dump({"data": {"view_names": ["v1"]}}))
    
    migrate(paths)
    assert not (tmp_path / "project.yaml").exists()

def test_migrate_logs_parsing_error(tmp_path, caplog):
    paths = ProjectPaths(data_dir=tmp_path)
    
    # Malformed YAML
    bad_yaml = tmp_path / "malformed.yaml"
    bad_yaml.write_text("invalid: yaml: : content")
    
    migrate(paths)
    
    assert "Error parsing YAML from" in caplog.text
    assert "malformed.yaml" in caplog.text

def test_migrate_logs_read_error(tmp_path, caplog):
    paths = ProjectPaths(data_dir=tmp_path)
    
    # File we can't read
    unreadable = tmp_path / "unreadable.yaml"
    unreadable.touch()
    unreadable.chmod(0) # Remove all permissions
    
    try:
        migrate(paths)
        assert "Error reading file" in caplog.text
        assert "unreadable.yaml" in caplog.text
    finally:
        unreadable.chmod(0o600) # Restore for cleanup
