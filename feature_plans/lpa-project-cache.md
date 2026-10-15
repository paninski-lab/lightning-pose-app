# Project cache (`.project-cache`)

App-owned notes that live in the project data directory. Two files for this work: file-manager validation results and ffprobe results for videos. A stored result is reused when a stat says the file is unchanged. A hash is the backup check when the timestamp is too coarse to trust.

Ignored video directories stay in the process-global dict. Persisting them is deferred.

## What this is not

| Store | Who it is for | What it holds |
| --- | --- | --- |
| `~/.lightning-pose/projects.toml` | This machine's app registry | Project key, `data_dir`, `model_dir` |
| `<data_dir>/project.yaml` | Lightning Pose | Views, keypoints, skeleton, schema version |
| `<data_dir>/.project-cache/` | Lightning Pose App | Choices and derived notes the app needs between restarts |

Do not write app-only fields into `projects.toml` or `project.yaml`. Lightning Pose reads those. A missing cache must not change training, labeling, or project open. Deleting `.project-cache` is always safe: the app falls back to empty ignores and "not checked".

No numbered migration. Absence is the default. Do not rewrite `project.yaml` to announce the folder.

## Where it lives

```
<data_dir>/.project-cache/
  file-checks.json
  video-probes.json
```

`data_dir`, not `model_dir`. Ignored folders are children of the data directory, and the cache should move when that directory is copied or relocated. The registry key is not stored in the files. Two registry entries that share a data directory share one cache.

The leading dot keeps the folder out of `rglob` (`wcmatch` does not set `DOTMATCH`). Do not add a special hide rule unless a listing starts showing it.

Refuse to read or write the folder when `.project-cache` is a symlink, or when a file inside it resolves outside `data_dir`.

Writes are atomic: write a temporary file in the same directory, then `os.replace`. A crash may leave a `*.tmp` file; ignore those. A file that is missing, unreadable, or the wrong `schema` is treated as empty. Do not fail project open because the cache is bad.

JSON, not TOML. These files are nested app notes, not hand-edited Lightning Pose config. Every file has an integer `schema` field, starting at `1`.

Project delete already removes `data_dir`, so the cache goes with it. Removing a project from the list without deleting files leaves the cache in place.

## Ignored video directories (deferred)

Not part of the current work. The notes below are the design for a later change. Today `ignored_video_dirs.py` keeps the list in a process-global dict. `setIgnoredVideoDirs` validates the names, then `remember_ignored_video_dirs` stores them until the process exits. Restarting the app checks every `videos*` folder again.

Replace that dict with this file:

```json
{
  "schema": 1,
  "dirs": ["videos-for-each-labeled-frame"]
}
```

`dirs` is the list the user saved: folder names, not paths. The existing checks stay (name starts with `videos`, direct child of `data_dir`, is a directory, no duplicates).

On read, keep names that are not currently a directory. Skipping a missing name is harmless, and deleting the name would forget the choice if the folder is only temporarily gone. The next successful `setIgnoredVideoDirs` rewrites the file from the request, which is how names are removed.

`getProjectInfo` still returns `ignored_video_dirs`. Callers (`iter_project_mp4s`, inference, the videos page) keep using that list. They do not read the JSON themselves.

**Test:** `app_server/tests/routes/test_videos.py` — `test_ignored_video_dirs_survive_a_new_process`. Save a skip list, drop the in-memory copy the way a restart would, and assert the sibling `videos/` mp4 is still listed while the ignored folder's mp4 is not. That is the failure this file exists to prevent: a restart silently starts offering videos the user had hidden.

## How a stored result stays fresh

Validation and ffprobe both store a result next to the file identity it was computed from. Reuse that result only when the identity still matches. Otherwise treat it as not checked and recompute.

Check in this order. Stop at the first failure.

1. **Project context**, for validation only. `views` and `keypoints` must equal the current `project.yaml` lists, order included. Calibration compares camera names in order. A CSV can become wrong when keypoints change and the file does not.
2. **Size and `mtime_ns`.** One `stat`. If either differs, the file changed. This is the common path: saves, edits, and ordinary copies update one or both, and it does not read the file.
3. **Hash, only when the timestamp is coarse.** If `mtime_ns` is an exact second (`mtime_ns % 1_000_000_000 == 0`), a copy may have kept a one-second stamp (`cp -p`, `rsync -t`, tar, FAT). Compare a hash to the one stored with the result. Equal means unchanged. Different means changed.

When size and `mtime_ns` both match and the timestamp has a fractional part, do not hash. Re-hashing every visit would read whole videos and large CSVs for a case normal edits already cover.

Store the hash at compute time, when the file is already being read. Small text files (label CSVs, calibration TOML, model `config.yaml`, `ensemble.yaml`, `train_status.json`) get a full SHA-256. Videos get a sample hash: SHA-256 of the first 1 MiB concatenated with the last 1 MiB. ffprobe only inspects the start of the file, and hashing a multi-gigabyte video on each probe would be slower than the probe. A replacement that keeps size, a one-second mtime, and both ends of the file is not a case worth a full read.

Never store a bare `ok: true` or `is_all_intra: true` without `size`, `mtime_ns`, and the hash. A missing entry, a mismatch, or a bad cache file means **not checked**. The UI must not show that as OK or as all-intra. A stale "has issues" or "not all-intra" is acceptable because the next check corrects it. A stale OK is not.

When this app saves, renames, or deletes a cached path, drop that entry in the same request. A same-second rewrite can keep `mtime_ns`.

Dependencies that are not the subject file:

- A label CSV's "missing images" result also records whether each indexed image existed. On read, `stat` those paths. Do not hash frames. The check never reads pixels.
- A `labeled-data` session is a name check. Fast reject is the directory `mtime_ns`. Then compare the sorted child names. Do not hash images.
- A model directory records `size` and `mtime_ns` of each file the validator inspected (`config.yaml`, `ensemble.yaml`, `train_status.json`, and names under `video_preds`). Hash those small YAML/JSON files the same way as other text. Do not hash prediction CSVs. If that list gets larger than walking the directory again, skip the cache for that model and recompute.

## File-manager checks

`validateProjectFiles` covers label CSVs, `labeled-data` sessions, calibration TOML, and model directories. Results go in `.project-cache/file-checks.json`, keyed by sector plus path relative to `data_dir` (models: relative to `model_dir`, matching today's `FileCheck.path`):

```json
{
  "schema": 1,
  "entries": {
    "labels:CollectedData.csv": {
      "size": 12004,
      "mtime_ns": 1729000123456789000,
      "sha256": "<hex>",
      "context": {
        "views": [],
        "keypoints": ["nose", "tail"]
      },
      "deps": [
        { "path": "labeled-data/sess/img000.png", "exists": true }
      ],
      "issues": [],
      "warnings": []
    }
  }
}
```

The Validate button always recomputes that sector, then replaces those entries. Opening the file manager may show the stored result when the checks above pass, so a second visit does not re-parse every CSV.

**Test:** `app_server/tests/routes/test_validate_project_files.py` — `test_cached_ok_is_dropped_when_the_label_file_changes`. Store an empty issue list for a label CSV, change the CSV so the header is invalid (size or mtime changes), and assert the read path does not return that cached OK. The failure this prevents is the file manager showing a clean label file after the file on disk was broken.

## Video probes

The videos page calls `ffprobe` on each mp4 for all-intra (and the rest of `FFProbeResponse`). That scan is capped at the first 10 seconds. Store the response in `.project-cache/video-probes.json`, keyed by path relative to `data_dir`:

```json
{
  "schema": 1,
  "entries": {
    "videos/clip.mp4": {
      "size": 8000000,
      "mtime_ns": 1729000123456789000,
      "sample_sha256": "<hex of first 1MiB + last 1MiB>",
      "probe": {
        "is_all_intra": true,
        "duration": 12.5,
        "width": 640,
        "height": 480,
        "fps": 30
      }
    }
  }
}
```

`probe` holds the `FFProbeResponse` fields except `file_path`, which is filled in from the request when the cache hits. The viewer reads codec, bitrate, and the other fields, so a shortened probe would change playback metadata. Same freshness rule as above. A stat match with a fractional mtime skips ffprobe. A coarse mtime checks `sample_sha256` and probes again on a mismatch. A probe that failed is not stored.

**Test:** `app_server/tests/routes/test_ffprobe.py` — `test_cached_all_intra_is_dropped_when_the_video_changes`. Store `is_all_intra: true`, replace the mp4 with a different file, and assert the read path does not return the cached true. The failure this prevents is the videos page skipping conversion because a replaced file still looks all-intra.

Leave these out until a screen needs them: last-opened label file, active model, and "don't warn again". The GPU batch-size file in `/tmp` stays machine state. `train_status.json` stays a training file.
