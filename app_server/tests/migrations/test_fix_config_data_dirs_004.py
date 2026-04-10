import yaml
import pytest
from pathlib import Path
from litpose_app.datatypes import ProjectPaths
from litpose_app.migrations.fix_config_data_dirs_004 import needs_migration, migrate


def _write_config(path: Path, data_dir: str, video_dir: str | None = None) -> None:
    data: dict = {"data": {"data_dir": data_dir}}
    if video_dir is not None:
        data["data"]["video_dir"] = video_dir
    path.write_text(yaml.dump(data, default_flow_style=False, sort_keys=False))


def test_needs_migration_false_when_correct(tmp_path):
    model_dir = tmp_path / "models" / "seed1"
    model_dir.mkdir(parents=True)
    _write_config(model_dir / "config.yaml", str(tmp_path))
    paths = ProjectPaths(data_dir=tmp_path)
    assert needs_migration(paths) is False


def test_needs_migration_true_when_stale(tmp_path):
    model_dir = tmp_path / "models" / "seed1"
    model_dir.mkdir(parents=True)
    _write_config(model_dir / "config.yaml", "/old/path")
    paths = ProjectPaths(data_dir=tmp_path)
    assert needs_migration(paths) is True


def test_needs_migration_no_models(tmp_path):
    paths = ProjectPaths(data_dir=tmp_path)
    assert needs_migration(paths) is False


def test_migrate_updates_data_dir(tmp_path):
    model_dir = tmp_path / "models" / "seed1"
    model_dir.mkdir(parents=True)
    _write_config(model_dir / "config.yaml", "/old/data")
    paths = ProjectPaths(data_dir=tmp_path)
    migrate(paths)
    result = yaml.safe_load((model_dir / "config.yaml").read_text())
    assert result["data"]["data_dir"] == str(tmp_path)


def test_migrate_updates_video_dir_with_prefix(tmp_path):
    model_dir = tmp_path / "models" / "seed1"
    model_dir.mkdir(parents=True)
    old_data = "/old/data"
    _write_config(model_dir / "config.yaml", old_data, video_dir="/old/data/videos")
    paths = ProjectPaths(data_dir=tmp_path)
    migrate(paths)
    result = yaml.safe_load((model_dir / "config.yaml").read_text())
    assert result["data"]["video_dir"] == str(tmp_path / "videos")


def test_migrate_warns_video_dir_no_prefix(tmp_path, caplog):
    model_dir = tmp_path / "models" / "seed1"
    model_dir.mkdir(parents=True)
    unrelated_video = "/completely/different/path/videos"
    _write_config(model_dir / "config.yaml", "/old/data", video_dir=unrelated_video)
    paths = ProjectPaths(data_dir=tmp_path)
    migrate(paths)
    result = yaml.safe_load((model_dir / "config.yaml").read_text())
    # data_dir updated, video_dir left unchanged
    assert result["data"]["data_dir"] == str(tmp_path)
    assert result["data"]["video_dir"] == unrelated_video
    assert "Could not migrate video_dir" in caplog.text


def test_migrate_skips_already_correct(tmp_path):
    model_dir = tmp_path / "models" / "seed1"
    model_dir.mkdir(parents=True)
    cfg = model_dir / "config.yaml"
    _write_config(cfg, str(tmp_path), video_dir=str(tmp_path / "videos"))
    original = cfg.read_text()
    paths = ProjectPaths(data_dir=tmp_path)
    migrate(paths)
    assert cfg.read_text() == original


def test_migrate_handles_bad_yaml(tmp_path, caplog):
    model_dir = tmp_path / "models" / "seed1"
    model_dir.mkdir(parents=True)
    (model_dir / "config.yaml").write_text("invalid: yaml: : content")
    paths = ProjectPaths(data_dir=tmp_path)
    migrate(paths)  # should not raise
    assert "Failed to fix config data dirs" in caplog.text


def test_migrate_nested_model_dir(tmp_path):
    # 2 levels deep (grandchild): models/2024-01-01/10-00-00/config.yaml
    nested = tmp_path / "models" / "2024-01-01" / "10-00-00"
    nested.mkdir(parents=True)
    _write_config(nested / "config.yaml", "/old/data", video_dir="/old/data/vids")
    paths = ProjectPaths(data_dir=tmp_path)
    migrate(paths)
    result = yaml.safe_load((nested / "config.yaml").read_text())
    assert result["data"]["data_dir"] == str(tmp_path)
    assert result["data"]["video_dir"] == str(tmp_path / "vids")


def test_migrate_no_video_dir_field(tmp_path):
    model_dir = tmp_path / "models" / "seed1"
    model_dir.mkdir(parents=True)
    _write_config(model_dir / "config.yaml", "/old/data")
    paths = ProjectPaths(data_dir=tmp_path)
    migrate(paths)
    result = yaml.safe_load((model_dir / "config.yaml").read_text())
    assert result["data"]["data_dir"] == str(tmp_path)
    assert "video_dir" not in result["data"]
