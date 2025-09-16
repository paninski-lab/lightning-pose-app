from fastapi import APIRouter

from . import multiview_autolabel as _multiview_autolabel
from . import save_mvframe as _save_mvframe
from . import write_multifile as _write_multifile
from . import find_label_files as _find_label_files

# Sub-route modules within the labeler package

# Aggregate router for labeler endpoints
router = APIRouter()

# Mount sub-routers
router.include_router(_write_multifile.router)
router.include_router(_save_mvframe.router)
router.include_router(_multiview_autolabel.router)
router.include_router(_find_label_files.router)
