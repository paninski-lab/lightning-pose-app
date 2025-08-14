from fastapi import APIRouter

from . import save_mvframe as _save_mvframe

# Sub-route modules within the labeler package
from . import write_multifile as _write_multifile

# Aggregate router for labeler endpoints
router = APIRouter()

# Mount sub-routers
router.include_router(_write_multifile.router)
router.include_router(_save_mvframe.router)
