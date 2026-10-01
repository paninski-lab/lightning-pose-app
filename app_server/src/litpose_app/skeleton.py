"""Validate a project skeleton without rejecting the rest of project.yaml."""

from __future__ import annotations

from typing import Any


def skeleton_problems(skeleton: Any, keypoint_names: list[str] | None) -> list[str]:
    """Return one explanation per problem. An empty list means the skeleton is valid.

    ``None`` and ``[]`` are valid and mean there are no bones. Any other shape is
    reported so a hand-edited file can still be loaded.
    """
    if skeleton is None or skeleton == []:
        return []
    if not isinstance(skeleton, list):
        return ["Skeleton must be a list of keypoint pairs."]

    known = set(keypoint_names or [])
    problems: list[str] = []
    seen: set[tuple[str, str]] = set()
    for index, pair in enumerate(skeleton):
        if (
            not isinstance(pair, (list, tuple))
            or len(pair) != 2
            or not all(isinstance(name, str) for name in pair)
        ):
            problems.append(f"Pair {index + 1} must be two keypoint names.")
            continue
        left, right = pair
        if left == right:
            problems.append(f"{left} is paired with itself.")
        if left not in known:
            problems.append(f"{left} is not a keypoint in this project.")
        if left != right and right not in known:
            problems.append(f"{right} is not a keypoint in this project.")
        key = tuple(sorted((left, right)))
        if key in seen:
            problems.append(f"{left} and {right} are listed more than once.")
        else:
            seen.add(key)
    return problems
