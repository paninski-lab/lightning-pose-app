# Changelog

All notable changes to Lightning Pose App are documented here. Version format is `X.Y.Z.W`: `X.Y.Z` is the lightning-pose version this app release is built for; `W` is this app's increment for that LP version, starting at `0`.

GitHub Releases use the matching `### [X.Y.Z.W]` section from this file. A `### [X.Y.Z.W.dev0]` heading is work that is not released yet. The release that publishes it renames that heading to `### [X.Y.Z.W] — YYYY-MM-DD`.

## 📝 Release Notes

### [2.4.2.4.dev0]

* **Label files:** Any `.csv` directly in the data directory can be a label file. It is hidden from the Labeler and Viewer only when it cannot be read as a label table. A missing frame, an unusual index path, or a keypoint mismatch is a warning in File Manager, and the file stays usable.

Tests: `test_validate_label_csv_hides_only_unusable_files` (a readable root CSV with a missing image stays in the label picker; a file that is not a label table does not; a CSV in a subdirectory is not listed).

* **Labeler:** A frame at the start of a video (frame 0 or 1) shows its own image under its keypoints. It used to show frame 2, so labels could be placed on the wrong picture. Temporal context uses the same five frames as Lightning Pose training: frames before the start repeat frame 0, a frame that does not exist shows the current frame, and the frame number is the first number in the file name. An image whose file name has no number is shown, and temporal context is disabled for it.

Tests: `temporal-context.spec.ts` (frame 0 gives `[0, 0, 0, 1, 2]`, frame 1 gives `[0, 0, 1, 2, 3]`, no digits gives no context, the first number in the name is used and every copy of it is replaced, padding grows past its width); `image-label-widget.component.spec.ts` (frames 0 and 1 show their own image, a name with no number shows the image, the chosen slot is shown, a slot that fails to load shows the current frame, and on the last frame of a video slots +1 and +2 show the current frame).

* **Labeler:** **Temporal context** has **Play** / **Pause**, **Previous** / **Next context frame**, and five dots you can click to jump to a frame. A label says which frame is shown (−2, −1, current, +1, +2), and when a slot shows a different frame it names that frame and why, for example “Showing: current in place of +2 (not found)” or “Showing: −1 in place of −2 (before the video starts)”. Keypoints show again when paused on the current frame. Opening another frame returns to the current frame. The controls are disabled, with a tip that says why, when the image file name has no frame number, when the frame's own image cannot be loaded, or when none of the frames around it were found (for example frames imported without their neighbors). Opening a frame again tries its images again. Playback stops and the current frame is shown.

Tests: `temporal-context.spec.ts` (stepping stops at −2 and +2; playback runs −2 … +2 and back and continues from where it was paused); `labeler-center-panel.component.spec.ts` (step buttons, dot clicks, Play then Pause holds the frame, a new frame returns to current, controls disabled with a tip when the file name has no frame number, the frame's own image fails (that tip wins over context frames not found), or the context frames are not found, and playback stops then; the label names the substitute frame); `image-label-widget.component.spec.ts` (keypoints shown only when paused on the current frame; `contextFramesMissing` is true only when every frame but the current one fails to load, not at the end of a video; `contextSlotViews` marks before-start and not-found slots; `currentFrameMissing`; failed images are tried again when the frame is opened again). `temporal-context.spec.ts` also covers `contextFrameOffsets` and `contextShowingText`.

* **Labeler saves:** A save writes every view's label file and labeling queue together. If any file fails to write, all of them are put back as they were, so one view can no longer end up with new labels while another keeps the old ones. If putting a file back also fails, the error names each affected file and the backup that holds its previous labels. A Labeler save and Extract Frames no longer overwrite each other's changes to the labeling queue.

Tests: `test_file_transaction.py` (a failure replacing the first, a later, or a new file restores every file and leaves no temp or backup files; a restore that fails names the file and keeps its backup; a failed backup changes nothing); `test_save_mvframe.py` (multiview save succeeds and cleans up; a failure replacing either view's CSV or either sidecar leaves all four files byte-for-byte unchanged; an unrestorable failure keeps the backup; a rejected view leaves no temp files; deleting the last frame works; adding to the queue waits for a save).

* **Project list:** `projects.toml` is written through a temp file, so a crash while saving it no longer empties the project list. A symlinked `projects.toml` stays a link.

Tests: `test_write_projects_toml_failure_keeps_old_registry` (a TOML write that fails partway leaves the old file and no temp file), `test_write_projects_toml_keeps_symlink`.

* **Keypoint markers:** In the Labeler and the Viewer, markers are drawn at the exact keypoint position at every marker size and zoom. They no longer shift when the size changes, turn capsule-shaped, or have their cross off center. Dragging a keypoint moves it by exactly the pointer's movement.

Tests: `keypoint-container.component.spec.ts` "markers" (circle centered on a fractional position with radius half the size, at sizes 5 and 10; the cross meets at the position; the selected ring; clicking a marker selects it; a drag moves the keypoint by exactly the pointer movement; Viewer markers keep their shadow).

* **Keypoint labels:** In the Labeler and the Viewer, a keypoint's name avoids corners that sit nearer another keypoint's marker than its own, so close keypoints are less likely to be mixed up. Such a corner is used only when every corner is worse. On the fly-anipose-tiny labels (8,820 names, default sizes), names nearer another marker dropped from 17.4% to 8.6%.

Tests: `keypoint-label-placement.spec.ts` "nearer another marker" (a corner 4px from another marker is skipped and the chosen corner is nearer its own marker; a farther marker keeps the lower-right; two markers a few pixels apart each get a name nearer their own marker); the existing corner-stickiness case now uses labels that overlap without a marker nearby.

* **Keypoint labels:** The black outline around a keypoint name scales with the label size. Small labels (1–4px) no longer show large black spiky shapes when zoomed in; every size has the outline the default 8px label has.

Tests: `keypoint-container.component.spec.ts` "label outline" (outline width is a quarter of the font size at 2px and 8px); `keypoint-label-placement.spec.ts` `labelStrokePad` (placement pads by half the outline at each size).

* **Image formats:** Labeled frames in any format that both Lightning Pose and the browser can read now show in the app, in any letter case: `.jpg`, `.jpeg`, `.jfif`, `.png`, `.apng`, `.bmp`, `.gif`, `.webp`, `.avif`. Before, only lowercase `.png` and `.jpg` showed, so frames like `img0001.JPG` were broken images. File Manager no longer flags these frames. Frames LP trains on but the browser cannot show (TIFF, PPM/PGM/PBM/PNM, TGA, JPEG 2000) get a File Manager warning, and the Labeler says so in place of the image. Validation results saved before this change are checked again.

Tests: `test_read_file.py` (each browser format served in upper and lower case with its content type; TIFF and JPEG 2000 refused with the can't-show message; other files still refused; CSVs keep `no-cache`); `test_image_formats.py` (Pillow reads every listed format; lookups ignore case); `test_validate_project_files.py` (`.JPG`, `.jpeg`, `.webp` and `.tif` frames are accepted in a label CSV and in `labeled-data/`, TIFF gets one warning, other files are still unexpected; a result saved under older rules is dropped); `image-formats.spec.ts`; `image-label-widget.component.spec.ts` "frame image message" (a TIFF frame shows the message right away; a failed frame says it could not be loaded); `labeler-center-panel.component.spec.ts` (temporal context tip for a TIFF frame).

* **Create model:** Changing **Epochs** also scales the epochs when the backbone unfreezes, when the learning rate drops, and (where the base config sets them) when patch masking ramps and the unsupervised losses start, by epochs ÷ the base config's `max_epochs`. A model with fewer than 250 epochs no longer fails at the start of training with `milestones must be <= training.max_epochs`; 100 epochs gives unfreezing epoch 7 and drops at 50, 67 and 83. 300 epochs writes the same config as before. The resulting schedule is shown under Epochs. A project `configs/default.yaml` that counts in steps (`max_steps`) is left as it is, and Epochs is disabled with a note.

Tests: `epoch-schedule.spec.ts` (unchanged at 300; 150, 600, 50 and 100 scale as in #172; 5 epochs gives unfreezing 1 and milestones 3, 4, 5; every count from 5 to 400 stays increasing and `<= max_epochs`; a project config with `max_epochs: 1000` scales relative to it; step-based and non-`multisteplr` configs); `create-model-dialog.component.spec.ts` "epochs scale the schedule" (the previewed config for 100 and 300 epochs, the hint under Epochs updates when Epochs is typed, a step-based base config gets no `max_epochs` and Epochs is disabled).

* **Create model:** **Pose PCA** is unchecked and disabled when the chosen label file has too few labeled frames for it. LP needs two training frames per keypoint, and the dialog counts training frames the way LP splits train and validation. The tip says how many frames are needed and how many there are, for example "Pose PCA needs at least 35 labeled frames for 17 keypoints (you have 34)." It is checked again when the label file or the train/validation split changes. A new `countLabeledFrames` call counts the frames in a label CSV as LP reads it.

Tests: `pose-pca.spec.ts` (train counts match LP's `split_sizes_from_probabilities`; 17 keypoints at 95/5 needs 35 frames; 10 keypoints at 80/20 needs 24); `create-model-dialog.component.spec.ts` "Pose PCA needs enough frames" (34 frames: disabled, unchecked, tip text, `pca_singleview` left out of the config; 35 frames: available; changing the split disables it and changing back restores the check); `test_count_labeled_frames.py` (an all-empty first row is counted, as LP does; absolute and data-dir-relative paths; a path outside the data directory is refused).

* **Extract frames on Windows:** Extracted frames are added to the labeling queue as `labeled-data/<session>_<view>/<name>.png`, with `/`. They used to be written with `\` on Windows, while other project files use `/` so a project can be copied to another OS. A queue that already holds `\` paths is read with `/`: the Labeler shows those frames at their `/` path, a frame already queued with `\` is not queued again, and saving the frame removes it from the queue.

Tests: `test_extracted_frame_is_queued_with_forward_slashes` (a Windows-style path is queued with `/`); `test_queue_with_backslash_and_slash_entries_counts_the_frame_once` (adding the `/` spelling of a `\` entry leaves the queue unchanged, and saving the frame removes it); `test_queue_entry_reads_backslashes_as_slashes`; `label-file-fetcher.service.spec.ts` (a `\` queue entry opens at its `/` path).

* **Sessions and views:** A multiview video, label CSV, prediction or labeled-data folder name is split into session and view at the last `_` everywhere in the app: the Viewer and Labeler session lists, the Viewer's prediction list, the Labeler's matching of a frame across views, the File Manager, the project list card counts, inference and EKS. The Viewer and Labeler used to take the first project view found anywhere in the name, so with views `cam1` and `cam10` the file `trial_cam10.mp4` was read as session `trial_*0`, and with views `top` and `side` the file `stop_top.mp4` was not grouped with `stop_side.mp4`. A name whose part after the last `_` is not a project view is listed on its own as an unknown view, as before. The project settings help now describes this rule.

Tests: `session-view.spec.ts` (last `_`; `cam1`/`cam10`; `stop_top`; unknown view, single-view and a view with `_` give no key; labeled-frame folders pair by `<session>_*`); `session.service.spec.ts` (sessions `trial_*` with views `cam1` and `cam10`; `stop_*` with `top` and `side`; `mouse1_back` on its own as unknown; prediction CSVs under the same keys); `test_session_view.py`; `test_inference.py` (the same names give sessions `trial` and `stop`; an unknown view is its own session).

* **Camera view names:** A new project can't be created with `_` in a view name. The form says why: "View names can't contain _ (cam_top), because video and folder names are split at the last _. Use - instead (for example cam-top)." An existing project with such a view shows the same text as a warning and can still be saved, and the File Manager Videos and Labeled Image Folders panels show it at the top, adding that those files show as Unknown view. View names, and keypoint names, that differ only in letter case (`Top`, `top`) get a warning.

Tests: `project-settings.component.spec.ts` "view and keypoint name checks" (new project with `cam_top`: error text and Save disabled, enabled after `cam-top`; existing project: warning and Save enabled; `Top`/`top` views; `Nose`/`nose` keypoints); `name-checks.spec.ts`; `view-underscore-notice.spec.ts` (both panels show the notice for `cam_top` and nothing without); `test_create_rejects_underscore_view_and_update_allows_it`.

### [2.4.2.3] — 2026-10-15

* **File manager:** Validation results and video probe results are kept in `.project-cache` in the project data directory. Opening a file panel shows the last check when the file is unchanged. A changed file, a deleted frame, or a keypoint change is not shown as OK until Validate runs again. Checking a video skips ffprobe when the file is unchanged, and a replaced video is not treated as all-intra from the old result.
* **Extract frames:** A session missing a camera view cannot be extracted. A frame that is already labeled or already in the labeling queue is not added again. In the Viewer, adding a frame shows a toast that names that frame and then goes away. Toasts share one duration, `ToastService.durationMs`.
* **Folder picker:** The path dropdown scrolls when a directory has more subfolders than fit on screen.
* **Multiview:** A project with exactly one camera view cannot be created or saved. Leave camera views blank for a single-view project. Projects that already have one view still open.
* **ffmpeg:** If ffmpeg or ffprobe is missing from PATH, a warning stays in the top bar. Videos will not open until both are installed.
* **Windows:** On native Windows, the top bar says labeling works here and training, inference, and video processing should run in WSL.
* **Keypoints:** Changing keypoint names warns that existing label files keep the old columns. Saving a label whose keypoint is not a column in that CSV shows an error and does not write the file.
* **Buttons:** Text buttons that were blue are green, including Cancel, Back, Close, and OK. Red buttons are unchanged.
* **Labeler:** The right-hand controls sit in a panel you can drag wider or narrower. The frame stays in the center. A large frame or a long side panel scrolls in place. The frame list stops when it meets the right-hand panel.
* **Viewer:** Views, models, and the other controls sit in a panel you can drag wider or narrower. Videos stay in the center, with the playback bar along the bottom of that center region. Either side panel can cover a video tile, and both stop at the playback bar instead of running off the screen.
* **View options:** In the Labeler, **Pixel grid overlay** is last in the list. **Show skeleton** uses the same label-then-toggle layout as the other switches in the Labeler and Viewer. All View Options toggles use the same size. **Image size** sets how large the frame is shown, the same way **Video tile size** works in the Viewer. **Keypoint label size** sits under **Keypoint labels** and is hidden while labels are off.
* **Labeler:** Keypoint markers and labels are sharp as soon as a labeled frame opens. They no longer stay blurry until you move a point or change marker or label size.
* **Keypoint labels:** In the Labeler and the Viewer, a name sits in the lower-right when that corner stays inside the frame and does not cover another name or marker. Otherwise it uses another corner until the lower-right is free again. The gap between the name and its marker stays the same when the label size changes. Names stay hidden until they can be placed, and the gap follows the letters rather than the em box.
* **Labeler:** Saving a labeled frame succeeds when the unlabeled-frame list is empty or has a blank line. A failed save shows the server error instead of `[object Object]`.
* **Viewer:** On a single-view project, the **Views** list is hidden. A video tile shows the info icon, then the view name only when the project has more than one camera, then the video file name.
* **Viewer:** A message sits just above the playback bar instead of covering it.
* **Labeler:** The frame sits in a tile with a header: an info icon for the image path, the view name when the project has camera views, the image file name, and a close button that returns to the frame list.
* **Labeler and Viewer:** The frame is as tall as the picture. A wide image or video no longer sits in a square with empty space underneath. The top corners of the tile stay rounded; the bottom corners are square.
* **View options:** **Image size** and **Video tile size** go up to 1200px.
* **Labeler and Viewer:** The left and right panels scroll up and down only. A long name no longer adds a sideways scroll bar.
* **Labeler:** **Keypoints** and **Multiview tools** fold open and closed. The help button sits next to **Multiview tools**.

Tests: `test_create_and_update_reject_exactly_one_camera_view` (one view rejected; none and two accepted); `project-settings.component.spec.ts` (one camera view disables Save); `test_get_global_context_reports_ffmpeg_and_windows`; `test_save_mvframe_rejects_keypoint_missing_from_columns` (mismatched keypoint is not written); `test_save_mvframe_skips_blank_unlabeled_sidecar_lines` (blank unlabeled sidecar does not break save); `test_cached_ok_is_dropped_when_the_label_file_changes` (a broken label CSV is not shown as OK from the cache); `test_cached_all_intra_is_dropped_when_the_video_changes` (a replaced video is not treated as all-intra from the cache); `test_extract_frames_rejects_incomplete_session_views` (a session missing a camera is not extracted); `test_extract_frames_rejects_frame_already_in_label_csv` (a frame already in the label file is not queued again).

### [2.4.2.2] — 2026-10-12

* **Project delete:** Permanently deleting files requires typing the project name and refuses protected directories (home, the server working directory, `~/.lightning-pose`, or a path that contains another project). Removing a project from the list without deleting files is unchanged.

**File Manager**

* **Screen:** **File Manager** is in the top screen list only (`/project/<key>/files`). It is not a card on the project home screen. The page has five panels: **Label Data (CSV)**, **Videos**, **Labeled Image Folders**, **Models**, and **Camera Calibration**. Each panel starts with a collapsed **Help** chip.
* **Videos:** **Video directories (`videos*/`)** sits above the folder checkboxes. Unchecked folders stay on disk and are left out of the app until it restarts. **Add Video** opens Import Session. **Check** and **Process** still convert videos to all-intra in place.
* **Adding files:** **Add Label File** and **Add Model** copy into the project and leave an existing file or folder unchanged. **Add Calibration** asks for a project file or session files. A project file is renamed to `calibration.toml`. A session file is copied into `calibrations/`. If that destination already exists, the dialog asks before replacing it. On a single-view project, Camera Calibration says it is not used and the rest of that panel is disabled.
* **Buttons:** The **Add** button is green and is the leftmost button on its row. The other File Manager buttons are blue. **Delete Selected** is red and requires typing the model path.

**Labeler**

* **Frame actions:** **Save**, **Save and next**, **Next →**, and **Revert changes ↫** stack in one column and use the blue button. **Next** opens the next frame in the combined list without saving. **Revert** restores a labeled frame, or clears an unlabeled frame and leaves it in **Remaining frames to label**. Both remove-frame actions are the red trash icon.
* **Multiview tools:** **Load Calibration**, then **Refine calibration**, then **Project keypoints to all views**. The first two are blue. **Load Calibration** uses the same project-or-session choice, and asks before replacing an existing file.
* **Label files:** A pandas scorer suffix such as `.1` is ignored when deciding whether a CSV is a label file, so those files show up in the Labeler and Viewer.

**Buttons**

* Text buttons use the existing soft green, blue, and red. Green opens another screen or dialog, or writes files, except for the blue Labeler and Models actions noted above. The selected page in Project settings and model creation is a darker fill with no outline.

Tests: `test_import_label_and_model_copy_without_overwrite` and `test_import_calibration_creates_folder_and_copies_toml` (copy without overwrite); `test_import_calibration_project_file_and_overwrite` (project `calibration.toml` and overwrite); `test_find_label_files_logic` (pandas scorer suffix); `test_delete_model_requires_typed_path_and_stays_inside_model_dir`; `file-listing.spec.ts` (**Validate All** keeps list order); `frame.model.spec.ts` and `labeler-page.component.spec.ts` (revert and next frame).

### [2.4.2.1] — 2026-09-29

**Skeleton**

* **Project settings:** New **Skeleton** tab (and the same step in the create-project wizard) to add and remove bones as pairs of keypoint names. The list is saved only in `<data_dir>/project.yaml` under `skeleton:`; display toggles and styling stay in Labeler/Viewer view options (`localStorage`), not in the yaml.
* **Validation:** One shared rule set for Settings, Labeler, and Viewer (unknown or duplicate keypoints, duplicate pairs, wrong shape, and so on). Invalid definitions show red errors in Settings; the server rejects a bad save; Labeler and Viewer do not draw bones until the definition is valid. Projects with no `skeleton` key behave as before (no bones).
* **Labeler and Viewer:** Valid bones render as blue SVG segments behind keypoint dots and labels, scaled with zoom. **View options** add **Show skeleton**, **Bone thickness** (0–5 px, default 2, step 0.05), and **Bone opacity** (0–1).

Tests: `app_server/tests/routes/test_project.py` (yaml round-trip, reject invalid save, project without `skeleton` key); `skeleton-validity.spec.ts` (rule catalog); `project-skeleton.component.spec.ts` (settings add/remove and errors); `skeleton-bones.spec.ts`, `skeleton-overlay.component.spec.ts`, `keypoint-container.component.spec.ts`, `skeleton-view-options.component.spec.ts` (geometry, stroke, z-order, sliders).

**Viewer**

* **Transport bar:** Frame seek uses a DaisyUI `range` slider (max aligned to the last frame, not duration overflow). An info icon opens a tooltip: typed frame and time entry, then the keyboard shortcut list. Previous/next frame buttons document **Shift+click** for ±10 frames (matching Shift+arrow). Clicking the current/total time readout focuses the time field for editing.

Tests: `video-player-controls.component.spec.ts` (slider bounds, Shift+click, typed frame/time, help copy); `video-player-keyboard.spec.ts` (shortcut → action map); `video-player-state.spec.ts` (seek, step, playback rate).

**Development**

* **`CONTRIBUTING.md`:** Node version, honcho vs `litpose run_app` / `build_ui.sh`, and DaisyUI + Storybook workflow for UI work. Lightning Studio–specific setup remains in `DEV.md`.
* **`AGENTS.md`:** UI component boundaries and keeping specs in sync when changing the web UI.
* **`DEV.md`:** Documents app version `X.Y.Z.W` and `.dev0` pre-release versions in `app_server/pyproject.toml`.

### [2.4.2.0] — 2026-09-21

**Version alignment**

* Align the app version with lightning-pose 2.4.2 (first app increment for this LP version).

**New Features**

* **Viewer transport controls:** Frame step (±1 and ±10 via Shift+arrow or Shift+click), jump to start/end, and slow-motion playback (1× down to 1/16×).
* **Viewer keyboard shortcuts:** Play/pause, stepping, and seek shortcuts; keypoint overlays stay aligned with video during seeks.
* **Viewer help:** Shortcut cheat sheet on a help control on the transport bar.

**Development**

* Split contributor/maintainer docs into `CONTRIBUTING.md` and `DEV.md` (replaces `development.md`); short-lived branches and PRs into `main`.
* Add `scripts/publish_github_release.sh` to tag and create GitHub Releases from `app_server/pyproject.toml` and `CHANGELOG.md` notes (PyPI publish still follows the existing release workflow).
* Move package build scripts to `scripts/build/` (`build_ui.sh`, `build_wheel.sh`).
* `Procfile.dev` uses the local Angular CLI from `web_ui/node_modules` so honcho does not require a global `ng`.
* Add `AGENTS.md` as the agent entry point; ignore `.cursor/` in the repo.

### [2.2.0.0] — 2026-05-20

**Extract Frames Robustness**

* Fixed a bug by adding data integrity checks to the extract frames process.

**Camera Calibration Support in Models**

* Models can now use camera calibration files to enable new 3D capabilities. Requires calibration files to be present.
  * **3D image augmentation:** Apply augmentations in 3D space across calibrated camera views.
  * **Multiview loss:** Add multiview geometric loss terms during training.

**Tunable Loss Log-Weights**

* Users can now tune the log weight of individual losses, including multiview loss and unsupervised losses.

### [2.0.8.4] — 2026-04-20

**Multiview EKS Model Support**

This release introduces support for **Ensemble Kalman Smoother (EKS)** for multiview projects. It uses ensemble variance and spatiotemporal constraints to produce better predictions in cases where views disagree due to occlusions or overconfident tracking errors.

* **Workflow:**
  * Create an EKS model from the Models page. Select base models trained with different random seeds. This just creates a directory with the member models.
  * Run inference on all sessions to get predictions that can be viewed in the Viewer
* **Seamless Integration:** EKS model predictions follow the standard model directory schema.
* **Chained Inference:** Running inference on an EKS model automatically triggers inference for all constituent member models.

**Limitations:** Currently the app does not yet support non-linear EKS and singleview EKS. You can run these manually and view the predictions in the viewer as long as the model directory schema matches the schema expected by the app.

**New "Run inference on all sessions" Flow:**

* **Replaces** old inference that only ran inference on newly uploaded videos.
* **Full coverage:** Automatically processes all new sessions and models, skipping already-processed sessions, to ensure maximum model coverage in the Viewer.
* **OOM Solution:** Dynamically reduces batch size to prevent CUDA Out-of-Memory errors.
* **Live Feedback:** Displays real-time terminal output with an option to cancel.

**Project management:**

* **Add existing project** from the homepage
* **Update existing project paths** from the homepage
* **New Directory picker UI** replaces plain text path inputs

**Other new features**

* **Global Task Indicator:** Animated indicator in the navbar when there is active training or inference going on.
* **Viewer > Upload session:** Added ability to "Upload a new session" from the viewer
* **Tensorboard Integration:** Model details page now includes a "Tensorboard" tab with a ready-to-copy --logdir command.
* **Viewer > videos all intra check:** Added a warning when viewer detects videos that are not transcoded to the Viewer requirement of every-frame-is-intra-frame. This happens normally during video import but users may manually add videos to the directory and should be aware of it.

**Bug Fixes**

* **Train/inference concurrency:** Enforce a limit of one active inference or training session at a time.
* **UI Status Polling:** Fixed a bug where models remained in PENDING status; the list now correctly refreshes every 2.5s to show TRAINING.
* **Path Persistence:** Added automatic repair of stale data_dir and video_dir paths in model configs when a project is relocated.
* **Video import normalization:** Normalize Pixel Aspect Ratio to 1:1
* **Video import singleview UX**: no longer has leaks of multiview UI
* **Video import session completeness validation**: no longer allows importing sessions with some views missing

### [2.0.8.3] — 2026-04-08

* Add viewer warning if video framerate or duration is inconsistent across views
* Fix 2.0.8.2 fps calculation
* Fix message in create model dialog about base 

### [2.0.8.2] — 2026-04-08

* Add ffprobe debug info to each video tile in the viewer.
* Fix 2.0.8.1 bug when multiview videos had different sizes

### [2.0.8.1] — 2026-04-08

(Yanked, do not use)

* Fix viewer bug impacting accuracy of keypoint placement in rare scenarios.

### [2.0.8.0] — 2026-04-07

* Redesigned Home page with a responsive project grid and rich project statistics (https://github.com/paninski-lab/lightning-pose-app/pull/65)
* Added project deletion: unregister vs. full delete (https://github.com/paninski-lab/lightning-pose-app/pull/65)
* Updated dropdown component: darker background, Popover API, fixed Actions button in models (https://github.com/paninski-lab/lightning-pose-app/pull/65)
* Added informational tooltips about file paths used in app: projects, labels, sessions (https://github.com/paninski-lab/lightning-pose-app/pull/73)
* Refined single-view labeler experience by hiding 'unknown' view (https://github.com/paninski-lab/lightning-pose-app/pull/73)
* Restored keypoint name tooltips in labeler and added keypoint label font size slider (https://github.com/paninski-lab/lightning-pose-app/pull/74)

### [2.0.7.1] — 2026-03-17

* Refined labeler UX Fixed dragging off-center behavior, fixed subpixel rendering, and added keypoint text
  labels (https://github.com/paninski-lab/lightning-pose-app/pull/61)
* Added keypoint opacity and size controls to the labeler (https://github.com/paninski-lab/lightning-pose-app/pull/61)
* Added tooltips for data and model directories on project
  hover (https://github.com/paninski-lab/lightning-pose-app/pull/62)
* Added likelihood threshold control in viewer (https://github.com/paninski-lab/lightning-pose-app/pull/62)
* Improved display of calibration file information (https://github.com/paninski-lab/lightning-pose-app/pull/62)

### [2.0.7.0] — 2026-02-26

* Added slider for video tile size in viewer
* Improved speed of loading label files and sessions lists by @hummuscience in https://github.com/paninski-lab/lightning-pose-app/pull/55
* Improved robustness of model creation date by @hummuscience in https://github.com/paninski-lab/lightning-pose-app/pull/55
* Fixed bug with saving empty labeling queue in https://github.com/paninski-lab/lightning-pose-app/pull/58

### [2.0.5.4] — 2026-02-17

**Added:**

* Ability to resize left pane in Viewer, Labeler

**Bugs Fixed:**

* Labeled frames duplicated in unlabeled frames queue (https://github.com/paninski-lab/lightning-pose-app/issues/51)

### [2.0.5.3] — 2026-02-10

Update (2026-02-17): This version introduced a bug https://github.com/paninski-lab/lightning-pose-app/issues/51 that was
resolved in the next version, 2.0.5.4

**Added:**

* Extract frame from Viewer feature
    * You can now mark frames for labeling from the viewer, including the model's predictions on that frame.
* Remove frame from Label File or Label Queue feature
* Labeler View Options
    * See temporal context of frame (+/- 2 frames)
    * Image Brightness and Contrast slider

**Behind the scenes**

* Icons are now embedded in the app instead of CDN-hosted, so they can render locally without internet.
* Upgraded Angular from v20 to v21

### [2.0.5.2] — 2026-02-04

**Added**

* **Bundle Adjustment**
    * Preview calibration before saving
    * Adjust extrinsics only by default, other algorithm improvements
* **Model Management**
    * Support for deleting and renaming models from the models table
    * Auto-open model logs after creation
* **Misc**
    * Added in-browser recommendation to use Chrome
    * Added release notes link in upgrade check

---

### [2.0.5.1] — 2026-01-22

**Added**
* Extract frames: Manual frame selection. You can now specify a comma-separated list of frame indices to extract from a video.
* Support for uploading AVI files

**Fixed**
* Some usability quirks in the scroll-to-zoom viewports. 

---

### [2.0.5.0] — 2026-01-13

**Initial Release**
