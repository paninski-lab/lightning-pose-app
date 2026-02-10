# Lightning pose app

[![PyPI version](https://img.shields.io/pypi/v/lightning-pose-app.svg)](https://pypi.org/project/lightning-pose-app/)

Welcome to the git repo for the lightning-pose-app.

This is a separate repo from core lightning-pose. 
You should not have to clone this unless changing source code.

## 📖 Documentation

Our full documentation, including installation guides, API references, and advanced tutorials, is available at:

👉 **[https://lightning-pose.readthedocs.io/](https://lightning-pose.readthedocs.io/)**

---

## 📝 Release Notes

### [2.0.5.3] — 2026-02-10

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
