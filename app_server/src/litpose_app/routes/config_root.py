from fastapi import APIRouter, Depends
from pydantic import BaseModel

from litpose_app.rootconfig import RootConfig

from .. import deps


router = APIRouter()


class GlobalContextResponse(BaseModel):
    """Response model for global context containing app configuration and version info."""

    uploadDir: str
    homeDir: str
    versions: dict[str, str | None]
    isEditable: dict[str, bool]


def get_package_version(package_name: str) -> str | None:
    """Get version of an installed package."""
    import importlib.metadata

    try:
        return importlib.metadata.version(package_name)
    except importlib.metadata.PackageNotFoundError:
        return None


def is_editable_install(package_name: str) -> bool:
    """Check if a package is installed in editable mode."""
    import importlib.metadata

    try:
        dist = importlib.metadata.distribution(package_name)
        # Editable installs have a direct_url.json file
        if dist.read_text("direct_url.json") is not None:
            return True
    except (FileNotFoundError, KeyError, importlib.metadata.PackageNotFoundError):
        pass
    return False


@router.post("/app/v0/rpc/GetGlobalContext")
def get_root_config(
    rc: RootConfig = Depends(deps.root_config),
) -> GlobalContextResponse:
    from pathlib import Path

    # Get home directory using cross-platform library
    home_dir = str(Path.home())

    # Get package versions
    versions = {}
    is_editable = {}

    # Try to get lightning-pose-app version
    version = get_package_version("lightning-pose-app")
    if version is not None:
        versions["lightning-pose-app"] = version
        is_editable["lightning-pose-app"] = is_editable_install("lightning-pose-app")
    else:
        versions["lightning-pose-app"] = None
        is_editable["lightning-pose-app"] = False

    # Try to get lightning-pose version
    version = get_package_version("lightning-pose")
    if version is not None:
        versions["lightning-pose"] = version
        is_editable["lightning-pose"] = is_editable_install("lightning-pose")
    else:
        versions["lightning-pose"] = None
        is_editable["lightning-pose"] = False

    # Try to get eks version
    version = get_package_version("eks")
    if version is not None:
        versions["eks"] = version
        is_editable["eks"] = is_editable_install("eks")
    else:
        versions["eks"] = None
        is_editable["eks"] = False

    return {
        "uploadDir": str(rc.UPLOADS_DIR),
        "homeDir": home_dir,
        "versions": versions,
        "isEditable": is_editable,
    }
