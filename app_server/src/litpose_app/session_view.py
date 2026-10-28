"""Split a multiview file or folder name into session and view.

A multiview name is ``<session>_<view>``: the view is everything after the
**last** ``_``. LP reads ``labeled-data/<session>_<view>/`` folders, and so
finds ``calibrations/<session>.toml``, the same way. Every place in LPA that
needs the session or view of a name uses these functions, so they all agree.
A view name that contains ``_`` can't be read back from a name.
"""

from __future__ import annotations


def rsplit_session_view(stem: str) -> tuple[str, str] | None:
    """Split ``stem`` at its last ``_`` into ``(session, view)``.

    Returns None when there is no ``_``, or nothing before or after it.
    The view is not checked against the project's views.
    """
    session, sep, view = stem.rpartition("_")
    if not sep or not session or not view:
        return None
    return session, view


def split_session_view(stem: str, view_names: list[str]) -> tuple[str, str] | None:
    """``(session, view)`` when ``stem`` ends in ``_<view>`` for one of ``view_names``.

    The view is the part after the last ``_``. Returns None for a single-view
    project (no ``view_names``) and when that part is not a project view.
    """
    if not view_names:
        return None
    parts = rsplit_session_view(stem)
    if parts is None or parts[1] not in view_names:
        return None
    return parts


def session_of(stem: str, view_names: list[str]) -> str:
    """The session ``stem`` belongs to; the whole stem when it has no project view."""
    parts = split_session_view(stem, view_names)
    return parts[0] if parts else stem


def views_with_underscore(view_names: list[str]) -> list[str]:
    """View names that contain ``_`` and so can't be read back from a file name."""
    return [name for name in view_names if "_" in name]


def view_underscore_message(names: list[str]) -> str:
    """Explain why the view names in ``names`` can't contain ``_``."""
    return (
        f"View names can't contain _ ({', '.join(names)}), because video and folder "
        "names are split at the last _. Use - instead (for example cam-top)."
    )
