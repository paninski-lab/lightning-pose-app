import pytest

from litpose_app import deps
from litpose_app.config import Config
from litpose_app.rootconfig import RootConfig


def test_project_info_getter_fails_when_no_template_found(
    tmp_path, override_config: RootConfig
):
    # Setup project without project.yaml and no suitable templates
    project_data_dir = tmp_path / "my_project_fail" / "data"
    project_data_dir.mkdir(parents=True)

    project_util = deps.project_util(override_config)
    from litpose_app.datatypes import ProjectPaths

    project_util.update_project_paths(
        "fail_project", ProjectPaths(data_dir=project_data_dir)
    )

    app_config = Config()

    getter = deps.project_info_getter(project_util, app_config)

    with pytest.raises(deps.ApplicationError) as excinfo:
        getter("fail_project")

    assert "Could not find a project.yaml file in data directory." in str(excinfo.value)


def test_project_info_getter_fails_when_data_dir_missing(
    tmp_path, override_config: RootConfig
):
    # Setup project with a non-existent data directory
    project_data_dir = tmp_path / "missing_data_dir"
    # DO NOT create project_data_dir

    project_util = deps.project_util(override_config)
    from litpose_app.datatypes import ProjectPaths

    project_util.update_project_paths(
        "missing_project", ProjectPaths(data_dir=project_data_dir)
    )

    app_config = Config()

    getter = deps.project_info_getter(project_util, app_config)

    with pytest.raises(deps.ApplicationError) as excinfo:
        getter("missing_project")

    assert "Data directory" in str(excinfo.value)
    assert "does not exist." in str(excinfo.value)
    assert "project.yaml" not in str(excinfo.value)
