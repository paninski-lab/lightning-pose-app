# Frame extraction fixes

Covers GitHub issues [#70](https://github.com/paninski-lab/lightning-pose-app/issues/70), [#71](https://github.com/paninski-lab/lightning-pose-app/issues/71), and [#89](https://github.com/paninski-lab/lightning-pose-app/issues/89).

## Incomplete sessions

A multiview extract requires every camera view named in `project.yaml`. The Labeler session step stays disabled until the selected session has them, and `extractFrames` returns 422 if a request still omits one.

**Test:** `app_server/tests/routes/test_extract_frames.py` — `test_extract_frames_rejects_incomplete_session_views`. A `bot`+`top` project with only the `bot` video is rejected and no frames are written.

## Frames already labeled or queued

A center frame is already present when its `labeled-data/<video stem>/img########.jpg` path is a label CSV index or an `.unlabeled.jsonl` `frame_path`. Manual extract checks that before writing. Random extract checks after k-means and before writing. Either way the request returns 409 and adds nothing.

**Test:** `test_extract_frames_rejects_frame_already_in_label_csv`. A CSV row for frame 0 is not extracted again.

## Extract success message

The Viewer **Add** success message is a toast that names the frame that was added, for example "Added frame 23810 to the labeling queue." It dismisses after `ToastService.durationMs`. The playback bar lifts toasts so the message does not cover the seek bar.
