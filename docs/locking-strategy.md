# Locking Strategy: GPU & Scheduler Coordination

## Overview

The app server implements a two-lock strategy using OS-level file locks (`portalocker`) to coordinate GPU access and prevent duplicate training launches across multiple server instances on the same machine.

---

## Two Locks, Two Goals

### 1. GPU Lock (`/tmp/litpose_gpu.lock`)

An OS-level exclusive file lock shared across all processes on the machine.

- **Inference**: `gpu_lock_blocking()` — waits indefinitely until the GPU is free
- **Training**: `gpu_lock_nonblocking()` — fails immediately if GPU is busy; retried on the next scheduler cycle
- Metadata in `/tmp/litpose_gpu_task.json` tracks what's currently using the GPU (for UI display)
- On startup, `clear_stale_gpu_task()` clears stale metadata if the OS lock is actually free

### 2. Scheduler Lock (per-project `scheduler.lock`)

A per-project file lock that prevents multiple scheduler processes from launching the same project's training simultaneously.

The scheduler process (spawned from `main.py`) loops over all projects and attempts a non-blocking acquire per project. If it can't get the lock, it skips that project. This ensures only one scheduler "wins" a given project per cycle.

---

## Lock Acquisition Flow

### Training Path

1. Scheduler acquires `scheduler.lock` (non-blocking) — if fails, skip this project
2. Scheduler calls `gpu_lock_nonblocking()` — if GPU is busy, retry next cycle
3. If both acquired: launch training subprocess, hold GPU lock for its entire lifetime
4. GPU lock released when subprocess exits

### Inference Path

1. Inference request received
2. `gpu_lock_blocking()` called — blocks until GPU is available
3. Run inference steps sequentially in a background thread
4. GPU lock released when all steps complete (or on error)

---

## Design Goals

| Goal | Mechanism | Met? |
|------|-----------|------|
| Only one GPU user at a time | OS file lock at `/tmp/litpose_gpu.lock` (machine-wide) | Yes |
| Scheduler runs one iteration at a time per project | Per-project non-blocking lock + skip on failure | Yes |
| Survive server restart with stale lock | `clear_stale_gpu_task()` on startup | Yes |

---

## Code Locations

| Component | File | Lines |
|-----------|------|-------|
| GPU lock context managers | `utils/gpu_lock.py` | 67–101 |
| GPU task metadata I/O | `utils/gpu_lock.py` | 13–34 |
| Stale lock detection | `utils/gpu_lock.py` | 36–64 |
| Training scheduler loop | `train_scheduler.py` | 130–243 |
| Scheduler process startup | `main.py` | 72–86 |
| Stale lock cleanup on startup | `main.py` | 67–70 |
| Inference GPU lock usage | `routes/inference.py` | 400–428 |

---

## Known Gaps

1. **Inference blocks forever** — `gpu_lock_blocking()` has no timeout. If training hangs, inference queues indefinitely.
2. **No cross-machine coordination** — `/tmp/` is local. Distributed or NFS setups get no protection.
3. **Metadata cleared before lock release** (`gpu_lock.py:82–87`) — tiny race window where another task could acquire the lock and see no metadata.
4. **No timestamp in task metadata** — UI can't distinguish "just started" from stale metadata.

The design is appropriate for single-machine deployment. The main fragility is the infinite-blocking inference lock.
