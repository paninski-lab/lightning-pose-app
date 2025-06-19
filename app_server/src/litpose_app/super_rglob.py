import datetime

from wcmatch import pathlib as w


def super_rglob(base_path, pattern=None, no_dirs=False, stat=False):
    """
    Needs to be performant when searching over large model directory.
    Uses wcmatch to exclude directories with extra calls to Path.is_dir.
    wcmatch includes features that may be helpful down the line.
    """
    if pattern is None:
        pattern = "**/*"
    flags = w.GLOBSTAR
    if no_dirs:
        flags |= w.NODIR
    results = w.Path(base_path).glob(
        pattern,
        flags=flags,
    )
    result_dicts = []
    for r in results:
        stat_info = r.stat() if stat else None
        is_dir = False if no_dirs else r.is_dir() if stat else None
        if no_dirs and is_dir:
            continue
        entry_relative_path = r.relative_to(base_path)
        d = {
            "path": entry_relative_path,
            "type": "dir" if is_dir else "file" if is_dir == False else None,
            "size": stat_info.st_size if stat_info else None,
            # Note: st_birthtime is more reliable for creation time on some systems
            "cTime": (
                datetime.datetime.fromtimestamp(
                    getattr(stat_info, "st_birthtime", stat_info.st_ctime)
                ).isoformat()
                if stat_info
                else None
            ),
            "mTime": (
                datetime.datetime.fromtimestamp(stat_info.st_mtime).isoformat()
                if stat_info
                else None
            ),
        }

        result_dicts.append(d)
    return result_dicts
