"""Write files so a failure leaves either the new content or the old, never a mix.

``write_atomic`` replaces one file through a temp file. ``replace_files`` moves
several staged temp files over their targets and restores every target if one
replace fails. Neither survives the process being killed mid-commit; in that
case the ``.bak`` and ``.tmp`` files next to the targets hold both versions.
"""

from __future__ import annotations

import logging
import os
import shutil
import time
from collections.abc import Callable, Sequence
from pathlib import Path

logger = logging.getLogger(__name__)


class CommitRollbackError(RuntimeError):
    """A multi-file commit failed and some targets could not be restored.

    ``unrestored`` maps each target that may hold new content to the backup
    holding its previous content (None when the target did not exist before).
    The backups are kept on disk.
    """

    def __init__(self, unrestored: dict[Path, Path | None]):
        self.unrestored = unrestored
        lines = [
            f"  {target}: previous content in {backup}"
            if backup is not None
            else f"  {target}: did not exist before; delete it to restore"
            for target, backup in unrestored.items()
        ]
        super().__init__(
            "A save failed partway and these files could not be restored:\n"
            + "\n".join(lines)
        )


def write_atomic(path: Path, write: Callable[[Path], None]) -> None:
    """Call ``write(tmp)`` on a temp file next to ``path``, then replace ``path`` with it.

    If ``write`` or the replace fails, the temp file is removed and ``path`` is unchanged.
    """
    tmp = path.with_name(f".{path.name}.{os.getpid()}.{time.time_ns()}.tmp")
    try:
        write(tmp)
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def replace_files(staged: Sequence[tuple[Path, Path]]) -> None:
    """Move each staged ``(tmp, target)`` pair into place, all or none.

    Each existing target is first copied to ``<target>.<stamp>.bak``. If a
    replace fails, the targets already replaced are restored from their
    backups (a target that did not exist is removed), the remaining temp files
    are removed, and the original error is raised. If a restore fails, raises
    ``CommitRollbackError`` naming those targets and keeps their backups.
    Backups are removed once the commit or the rollback finishes.
    """
    stamp = time.time_ns()
    backups: dict[Path, Path | None] = {}
    try:
        for _, target in staged:
            if target.exists():
                backup = target.with_name(f"{target.name}.{stamp}.bak")
                shutil.copy2(target, backup)
                backups[target] = backup
            else:
                backups[target] = None
    except BaseException:
        _remove(b for b in backups.values() if b is not None)
        _remove(tmp for tmp, _ in staged)
        raise

    replaced: list[Path] = []
    try:
        for tmp, target in staged:
            os.replace(tmp, target)
            replaced.append(target)
    except BaseException as err:
        unrestored: dict[Path, Path | None] = {}
        for target in reversed(replaced):
            backup = backups[target]
            try:
                if backup is None:
                    target.unlink(missing_ok=True)
                else:
                    os.replace(backup, target)
            except OSError:
                logger.exception("Could not restore %s", target)
                unrestored[target] = backup
        _remove(tmp for tmp, target in staged if target not in replaced)
        _remove(
            backup
            for target, backup in backups.items()
            if backup is not None and target not in unrestored
        )
        if unrestored:
            raise CommitRollbackError(unrestored) from err
        raise

    _remove(b for b in backups.values() if b is not None)


def _remove(paths) -> None:
    for path in paths:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.exception("Could not remove %s", path)
