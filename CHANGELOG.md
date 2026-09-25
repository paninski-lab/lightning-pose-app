# Changelog

All notable changes to Lightning Pose App are documented here. Version format is `X.Y.Z.W`: `X.Y.Z` is the lightning-pose version this app release is built for; `W` is this app's increment for that LP version, starting at `0`.

GitHub Releases use the matching `### [X.Y.Z.W]` section from this file. A `### [X.Y.Z.W.dev0]` heading is work that is not released yet. The release that publishes it renames that heading to `### [X.Y.Z.W] — YYYY-MM-DD`.

## 📝 Release Notes

### [2.4.2.1.dev0]

**Viewer**

* **Transport bar:** Seek slider uses DaisyUI `range`. Playback help uses an info icon. The tip explains that frame and time can be typed, then lists keyboard controls. Previous/next frame tips include Shift+click (10 frames). Clicking the current/total time block focuses the time field.

Tests: `web_ui/src/app/video-player/video-player-controls/video-player-controls.component.spec.ts` (transport bar, Shift+click, typed frame/time, slider bounds, help copy and tips), `video-player-keyboard.spec.ts` (shortcut mapping), and `video-player-state.spec.ts` (seek, step, playback rate).

**Development**

* Document Node, honcho versus `litpose run_app` and `build_ui.sh`, and DaisyUI/Storybook in `CONTRIBUTING.md`. Lightning Studio setup stays in `DEV.md`.
* `AGENTS.md` now covers UI components and updating specs with the UI.
* Between releases, `app_server/pyproject.toml` uses the next app increment plus `.dev0` (see `DEV.md`).

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
