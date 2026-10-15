"""App notes under ``<data_dir>/.project-cache``.

Missing, corrupt, or wrong-schema files are empty. A symlink cache directory is
ignored so a link cannot redirect writes outside the project. Deleting the
folder is safe.
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
from pathlib import Path

CACHE_DIR_NAME = ".project-cache"
SCHEMA = 1
FILE_CHECKS_NAME = "file-checks.json"
VIDEO_PROBES_NAME = "video-probes.json"
SAMPLE_BYTES = 1024 * 1024
# Recording every prediction file is more work than validating the model again.
_PRED_FILE_CAP = 200
_TEXT_FILES = ("config.yaml", "ensemble.yaml", "train_status.json")

_lock = threading.Lock()


def sha256_file(path: Path) -> str:
    """SHA-256 of the whole file."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(SAMPLE_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sample_sha256(path: Path) -> str:
    """SHA-256 of the first 1 MiB concatenated with the last 1 MiB.

    A file of 1 MiB or less contributes its bytes twice. That is the same rule
    for every size, and it does not read a multi-gigabyte video.
    """
    size = path.stat().st_size
    with path.open("rb") as handle:
        first = handle.read(min(SAMPLE_BYTES, size))
        if size > SAMPLE_BYTES:
            handle.seek(size - SAMPLE_BYTES)
            last = handle.read(SAMPLE_BYTES)
        else:
            last = first
    digest = hashlib.sha256()
    digest.update(first)
    digest.update(last)
    return digest.hexdigest()


def identity_matches(
    path: Path,
    *,
    size: int,
    mtime_ns: int,
    digest: str,
    sample: bool = False,
) -> bool:
    """True when ``path`` still matches the stored size, mtime, and hash.

    Size or mtime differing means the file changed, and the hash is not read.
    When both match and the timestamp has a fractional part, the hash is not
    read either. A whole-second timestamp can be preserved by ``cp -p`` or
    tar, so only then is ``digest`` compared.
    """
    try:
        st = path.stat()
    except OSError:
        return False
    if st.st_size != size or st.st_mtime_ns != mtime_ns:
        return False
    if st.st_mtime_ns % 1_000_000_000 != 0:
        return True
    try:
        current = sample_sha256(path) if sample else sha256_file(path)
    except OSError:
        return False
    return current == digest


def project_context(views: list[str], keypoints: list[str]) -> dict[str, list[str]]:
    """Views and keypoints, order included, stored with a validation result."""
    return {"views": list(views), "keypoints": list(keypoints)}


def file_record(
    path: Path,
    *,
    issues: list[str],
    warnings: list[str],
    context: dict[str, list[str]],
    deps: list[dict] | None = None,
) -> dict | None:
    """Identity plus the check result for one file. None when the file cannot be read."""
    try:
        st = path.stat()
        digest = sha256_file(path)
    except OSError:
        return None
    record: dict = {
        "kind": "file",
        "size": st.st_size,
        "mtime_ns": st.st_mtime_ns,
        "sha256": digest,
        "context": context,
        "issues": list(issues),
        "warnings": list(warnings),
    }
    if deps is not None:
        record["deps"] = deps
    return record


def dir_record(
    path: Path,
    *,
    issues: list[str],
    warnings: list[str],
    context: dict[str, list[str]],
) -> dict | None:
    """Directory mtime and sorted child names. A non-directory is stored as a file."""
    try:
        if not path.is_dir():
            return file_record(
                path, issues=issues, warnings=warnings, context=context, deps=[]
            )
        st = path.stat()
        children = sorted(child.name for child in path.iterdir())
    except OSError:
        return None
    return {
        "kind": "dir",
        "mtime_ns": st.st_mtime_ns,
        "children": children,
        "context": context,
        "issues": list(issues),
        "warnings": list(warnings),
    }


def model_record(
    model_path: Path,
    *,
    issues: list[str],
    warnings: list[str],
    context: dict[str, list[str]],
) -> dict | None:
    """Model directory fingerprint. None when ``video_preds`` is too large to record."""
    try:
        if not model_path.is_dir():
            return None
        dir_stat = model_path.stat()
        children = sorted(child.name for child in model_path.iterdir())
        text_files: list[dict] = []
        for name in _TEXT_FILES:
            file = model_path / name
            if not file.is_file():
                continue
            st = file.stat()
            text_files.append(
                {
                    "name": name,
                    "size": st.st_size,
                    "mtime_ns": st.st_mtime_ns,
                    "sha256": sha256_file(file),
                }
            )
        preds = model_path / "video_preds"
        preds_kind = "absent"
        preds_mtime_ns = None
        pred_files: list[dict] = []
        if preds.is_symlink():
            return None
        if preds.exists():
            if preds.is_dir():
                preds_kind = "dir"
                preds_mtime_ns = preds.stat().st_mtime_ns
                kids = sorted(preds.iterdir(), key=lambda item: item.name)
                if len(kids) > _PRED_FILE_CAP:
                    return None
                for kid in kids:
                    if kid.is_file():
                        st = kid.stat()
                        pred_files.append(
                            {
                                "name": kid.name,
                                "size": st.st_size,
                                "mtime_ns": st.st_mtime_ns,
                            }
                        )
                    else:
                        pred_files.append({"name": kid.name, "dir": True})
            else:
                preds_kind = "file"
                st = preds.stat()
                pred_files.append(
                    {"name": preds.name, "size": st.st_size, "mtime_ns": st.st_mtime_ns}
                )
    except OSError:
        return None
    return {
        "kind": "model",
        "mtime_ns": dir_stat.st_mtime_ns,
        "children": children,
        "text_files": text_files,
        "preds_kind": preds_kind,
        "preds_mtime_ns": preds_mtime_ns,
        "pred_files": pred_files,
        "context": context,
        "issues": list(issues),
        "warnings": list(warnings),
    }


def replace_file_checks(data_dir: Path, sector: str, records: dict[str, dict]) -> None:
    """Replace every cached check in ``sector``. Keys absent from ``records`` are dropped."""
    prefix = f"{sector}:"
    with _lock:
        entries = {
            key: value
            for key, value in _entries(_read(data_dir, FILE_CHECKS_NAME)).items()
            if not str(key).startswith(prefix)
        }
        for rel, record in records.items():
            entries[f"{prefix}{rel}"] = record
        _write(data_dir, FILE_CHECKS_NAME, {"schema": SCHEMA, "entries": entries})


def drop_file_check(data_dir: Path, sector: str, rel: str) -> None:
    """Forget one cached check. A missing cache is a no-op."""
    key = f"{sector}:{rel}"
    with _lock:
        entries = dict(_entries(_read(data_dir, FILE_CHECKS_NAME)))
        if key not in entries:
            return
        del entries[key]
        _write(data_dir, FILE_CHECKS_NAME, {"schema": SCHEMA, "entries": entries})


def fresh_file_checks(
    data_dir: Path,
    model_dir: Path,
    sector: str,
    views: list[str],
    keypoints: list[str],
) -> list[dict]:
    """Checks whose stored identity still matches. Stale paths are omitted."""
    prefix = f"{sector}:"
    with _lock:
        snapshot = dict(_entries(_read(data_dir, FILE_CHECKS_NAME)))
    found: list[dict] = []
    for key, record in snapshot.items():
        if not str(key).startswith(prefix) or not isinstance(record, dict):
            continue
        rel = str(key)[len(prefix) :]
        if sector == "models":
            ok = _model_is_fresh(model_dir, rel, record, views, keypoints)
        elif sector == "labeled-data":
            ok = _dir_is_fresh(data_dir, rel, record, views, keypoints)
        else:
            ok = _file_is_fresh(data_dir, rel, record, views, keypoints)
        if not ok:
            continue
        issues = _string_list(record.get("issues"))
        warnings = _string_list(record.get("warnings"))
        if issues is None or warnings is None:
            continue
        found.append({"path": rel, "issues": issues, "warnings": warnings})
    return found


def fresh_video_probe(data_dir: Path, path: Path) -> dict | None:
    """Stored ffprobe fields when the video's identity still matches, else None."""
    rel = _relative(data_dir, path)
    if rel is None:
        return None
    with _lock:
        record = _entries(_read(data_dir, VIDEO_PROBES_NAME)).get(rel)
    if not isinstance(record, dict):
        return None
    size = record.get("size")
    mtime_ns = record.get("mtime_ns")
    digest = record.get("sample_sha256")
    probe = record.get("probe")
    if not isinstance(size, int) or not isinstance(mtime_ns, int) or not isinstance(digest, str):
        return None
    if not isinstance(probe, dict):
        return None
    if not identity_matches(path, size=size, mtime_ns=mtime_ns, digest=digest, sample=True):
        return None
    return dict(probe)


def store_video_probe(data_dir: Path, path: Path, probe: dict) -> None:
    """Remember ``probe`` for an mp4 inside ``data_dir``. Paths outside it are ignored."""
    rel = _relative(data_dir, path)
    if rel is None or path.suffix != ".mp4":
        return
    try:
        if not path.is_file():
            return
        st = path.stat()
        digest = sample_sha256(path)
    except OSError:
        return
    stored = {key: value for key, value in probe.items() if key != "file_path"}
    with _lock:
        entries = dict(_entries(_read(data_dir, VIDEO_PROBES_NAME)))
        entries[rel] = {
            "size": st.st_size,
            "mtime_ns": st.st_mtime_ns,
            "sample_sha256": digest,
            "probe": stored,
        }
        _write(data_dir, VIDEO_PROBES_NAME, {"schema": SCHEMA, "entries": entries})


def drop_video_probe(data_dir: Path, path: Path) -> None:
    """Forget a stored probe. The file does not have to exist."""
    rel = _relative(data_dir, path)
    if rel is None:
        return
    with _lock:
        entries = dict(_entries(_read(data_dir, VIDEO_PROBES_NAME)))
        if rel not in entries:
            return
        del entries[rel]
        _write(data_dir, VIDEO_PROBES_NAME, {"schema": SCHEMA, "entries": entries})


def relative_data_path(data_dir: Path, path: Path) -> str | None:
    """Path relative to ``data_dir``, or None when ``path`` is outside it."""
    return _relative(data_dir, path)


def _cache_file(data_dir: Path, name: str) -> Path | None:
    root = data_dir.resolve()
    folder = root / CACHE_DIR_NAME
    if folder.is_symlink() or (folder.exists() and not folder.is_dir()):
        return None
    path = folder / name
    if path.is_symlink():
        return None
    try:
        if path.exists() and not path.resolve().is_relative_to(root):
            return None
    except OSError:
        return None
    return path


def _read(data_dir: Path, name: str) -> dict:
    path = _cache_file(data_dir, name)
    if path is None or not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict) or data.get("schema") != SCHEMA:
        return {}
    return data


def _write(data_dir: Path, name: str, payload: dict) -> None:
    path = _cache_file(data_dir, name)
    if path is None:
        return
    folder = path.parent
    try:
        folder.mkdir(exist_ok=True)
    except OSError:
        return
    if folder.is_symlink() or not folder.is_dir() or path.is_symlink():
        return
    tmp = folder / f".{name}.{os.getpid()}.tmp"
    try:
        tmp.write_text(json.dumps(payload), encoding="utf-8")
        os.replace(tmp, path)
    except OSError:
        tmp.unlink(missing_ok=True)


def _entries(data: dict) -> dict:
    entries = data.get("entries")
    if not isinstance(entries, dict):
        return {}
    return entries


def _relative(data_dir: Path, path: Path) -> str | None:
    try:
        return path.resolve().relative_to(data_dir.resolve()).as_posix()
    except (ValueError, OSError):
        return None


def _context_ok(record: dict, views: list[str], keypoints: list[str]) -> bool:
    return record.get("context") == project_context(views, keypoints)


def _string_list(value: object) -> list[str] | None:
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        return None
    return list(value)


def _contained(root: Path, rel: str) -> Path | None:
    try:
        full = (root / rel).resolve()
        full.relative_to(root.resolve())
    except (ValueError, OSError):
        return None
    return full


def _deps_match(data_dir: Path, deps: object) -> bool:
    if not isinstance(deps, list):
        return False
    root = data_dir.resolve()
    for dep in deps:
        if not isinstance(dep, dict) or not isinstance(dep.get("path"), str):
            return False
        if not isinstance(dep.get("exists"), bool):
            return False
        full = _contained(root, dep["path"])
        if full is None:
            return False
        if full.is_file() != dep["exists"]:
            return False
    return True


def _file_is_fresh(
    root: Path, rel: str, record: dict, views: list[str], keypoints: list[str]
) -> bool:
    if record.get("kind") != "file" or not _context_ok(record, views, keypoints):
        return False
    full = _contained(root, rel)
    if full is None:
        return False
    size = record.get("size")
    mtime_ns = record.get("mtime_ns")
    digest = record.get("sha256")
    if not isinstance(size, int) or not isinstance(mtime_ns, int) or not isinstance(digest, str):
        return False
    if not identity_matches(full, size=size, mtime_ns=mtime_ns, digest=digest):
        return False
    deps = record.get("deps", [])
    return _deps_match(root, deps)


def _dir_is_fresh(
    root: Path, rel: str, record: dict, views: list[str], keypoints: list[str]
) -> bool:
    if record.get("kind") == "file":
        return _file_is_fresh(root, rel, record, views, keypoints)
    if record.get("kind") != "dir" or not _context_ok(record, views, keypoints):
        return False
    full = _contained(root, rel)
    if full is None or not full.is_dir():
        return False
    try:
        st = full.stat()
        children = sorted(child.name for child in full.iterdir())
    except OSError:
        return False
    if st.st_mtime_ns != record.get("mtime_ns"):
        return False
    return children == record.get("children")


def _model_is_fresh(
    model_dir: Path, rel: str, record: dict, views: list[str], keypoints: list[str]
) -> bool:
    if record.get("kind") != "model" or not _context_ok(record, views, keypoints):
        return False
    full = _contained(model_dir, rel)
    if full is None or not full.is_dir():
        return False
    try:
        st = full.stat()
        children = sorted(child.name for child in full.iterdir())
    except OSError:
        return False
    if st.st_mtime_ns != record.get("mtime_ns") or children != record.get("children"):
        return False
    text_files = record.get("text_files")
    if not isinstance(text_files, list):
        return False
    seen: set[str] = set()
    for item in text_files:
        if not isinstance(item, dict) or item.get("name") not in _TEXT_FILES:
            return False
        name = item["name"]
        seen.add(name)
        size = item.get("size")
        mtime_ns = item.get("mtime_ns")
        digest = item.get("sha256")
        if (
            not isinstance(size, int)
            or not isinstance(mtime_ns, int)
            or not isinstance(digest, str)
        ):
            return False
        if not identity_matches(full / name, size=size, mtime_ns=mtime_ns, digest=digest):
            return False
    for name in _TEXT_FILES:
        if (full / name).is_file() != (name in seen):
            return False
    return _preds_match(full / "video_preds", record)


def _preds_match(preds: Path, record: dict) -> bool:
    kind = record.get("preds_kind")
    try:
        exists = preds.exists()
    except OSError:
        return False
    if kind == "absent":
        return not exists
    if kind == "file":
        stored = record.get("pred_files")
        if not isinstance(stored, list) or len(stored) != 1 or not preds.is_file():
            return False
        item = stored[0]
        if not isinstance(item, dict):
            return False
        try:
            st = preds.stat()
        except OSError:
            return False
        return st.st_size == item.get("size") and st.st_mtime_ns == item.get("mtime_ns")
    if kind != "dir" or not preds.is_dir():
        return False
    try:
        st = preds.stat()
        kids = sorted(preds.iterdir(), key=lambda item: item.name)
    except OSError:
        return False
    if st.st_mtime_ns != record.get("preds_mtime_ns"):
        return False
    current: list[dict] = []
    try:
        for kid in kids:
            if kid.is_file():
                kid_stat = kid.stat()
                current.append(
                    {
                        "name": kid.name,
                        "size": kid_stat.st_size,
                        "mtime_ns": kid_stat.st_mtime_ns,
                    }
                )
            else:
                current.append({"name": kid.name, "dir": True})
    except OSError:
        return False
    return current == record.get("pred_files")
