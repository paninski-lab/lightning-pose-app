"""One rule splits a multiview name into session and view: the last ``_``."""

from litpose_app.session_view import (
    rsplit_session_view,
    session_of,
    split_session_view,
    view_underscore_message,
    views_with_underscore,
)


def test_rsplit_uses_the_last_underscore():
    assert rsplit_session_view("mouse1_day2_top") == ("mouse1_day2", "top")
    assert rsplit_session_view("top") is None
    assert rsplit_session_view("_top") is None
    assert rsplit_session_view("mouse1_") is None


def test_view_that_is_part_of_another_view():
    views = ["cam1", "cam10"]
    assert split_session_view("trial_cam10", views) == ("trial", "cam10")
    assert split_session_view("trial_cam1", views) == ("trial", "cam1")


def test_view_name_inside_the_session_name():
    views = ["top", "side"]
    assert split_session_view("stop_top", views) == ("stop", "top")
    assert split_session_view("stop_side", views) == ("stop", "side")


def test_unknown_view_or_single_view_keeps_the_whole_stem():
    assert split_session_view("mouse1_back", ["top", "side"]) is None
    assert session_of("mouse1_back", ["top", "side"]) == "mouse1_back"
    assert split_session_view("mouse1_top", []) is None
    assert session_of("mouse1_top", []) == "mouse1_top"


def test_view_with_underscore_is_not_read_back():
    # mouse1_cam_top splits as session mouse1_cam, view top; "top" is not a view.
    assert split_session_view("mouse1_cam_top", ["cam_top"]) is None
    assert views_with_underscore(["cam_top", "side"]) == ["cam_top"]
    assert "cam_top" in view_underscore_message(["cam_top"])
