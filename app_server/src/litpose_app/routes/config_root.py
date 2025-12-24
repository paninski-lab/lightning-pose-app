from fastapi import APIRouter, Depends

from litpose_app.rootconfig import RootConfig

from .. import deps


router = APIRouter()


@router.post("/app/v0/rpc/GetRootConfig")
def get_root_config(rc: RootConfig = Depends(deps.root_config)) -> dict:
    """Return a minimal snapshot of root configuration for the frontend.

    Currently exposes only the uploads directory path. Additional fields can be
    added later as needed. All paths are serialized to strings.
    """
    return {
        "uploadDir": str(rc.UPLOADS_DIR),
    }
