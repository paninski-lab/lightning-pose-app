from pathlib import Path
from textwrap import dedent

import tomli
import tomli_w
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
import sys
import uvicorn
from pydantic import BaseModel, ValidationError
from starlette import status
from starlette.requests import Request
from starlette.responses import Response
from starlette.staticfiles import StaticFiles

from .run_ffprobe import run_ffprobe
from .super_rglob import super_rglob

# use this example to pull useful features from:
# https://github.com/fastapi/full-stack-fastapi-template
app = FastAPI()


@app.exception_handler(Exception)
async def debug_exception_handler(request: Request, exc: Exception):
    """Puts error stack trace in response when any server exception occurs.

    By default, FastAPI returns 500 "internal server error" on any Exception
    that is not a subclass of HttpException. This is usually recommended in production apps.

    In our app, it's more convenient to expose exception details to the user. The
    security risk is minimal."""
    import traceback

    return Response(
        status_code=500,
        content="".join(
            traceback.format_exception(type(exc), value=exc, tb=exc.__traceback__)
        ),
        headers={"Content-Type": "text/plain"},
    )


PROJECT_INFO_TOML_PATH = Path("~/.lightning_pose/project.toml").expanduser()


class ProjectInfo(BaseModel):
    """Class to hold information about the project"""

    data_dir: Path | None = None
    model_dir: Path | None = None
    views: list[str] | None = None


"""
All our methods are RPC style (http url corresponds to method name).
They should be POST requests, /rpc/<method_name>.
Request body is some object (pydantic model).
Response body is some object pydantic model.

The client expects all RPC methods to succeed. If any RPC doesn't
return the expected response object, it will be shown as an
error in a dialog to the user. So if the client is supposed to
handle the error in any way, for example, special form validation UX
like underlining the invalid field,
then the information about the error should be included in a valid
response object rather than raised as a python error. 
"""


class GetProjectInfoResponse(BaseModel):
    projectInfo: ProjectInfo | None  # None if project info not yet initialized


@app.post("/app/v0/rpc/getProjectInfo")
def get_project_info() -> GetProjectInfoResponse:
    try:
        # Open the file in binary read mode, as recommended by tomli
        with open(PROJECT_INFO_TOML_PATH, "rb") as f:
            # Load the TOML data into a Python dictionary
            toml_data = tomli.load(f)

        # Unpack the dictionary into the Pydantic model
        # Pydantic will handle all the validation from here.
        obj = ProjectInfo(**toml_data)
        return GetProjectInfoResponse(projectInfo=obj)

    except FileNotFoundError:
        return GetProjectInfoResponse(projectInfo=None)
    except tomli.TOMLDecodeError as e:
        print(f"Error: Could not decode the TOML file. Invalid syntax: {e}")
        raise
    except ValidationError as e:
        # Pydantic's validation error is very informative
        print(f"Error: Configuration is invalid. {e}")
        raise


class SetProjectInfoRequest(BaseModel):
    projectInfo: ProjectInfo


@app.post("/app/v0/rpc/setProjectInfo")
def set_project_info(request: SetProjectInfoRequest) -> None:
    try:
        PROJECT_INFO_TOML_PATH.parent.mkdir(parents=True, exist_ok=True)

        # Convert the Pydantic model to a dictionary for TOML serialization.
        # Use mode=json to make the resulting dict json-serializable (and thus
        # also toml serializable)
        project_data_dict = request.projectInfo.model_dump(
            mode="json", exclude_none=True
        )
        try:
            with open(PROJECT_INFO_TOML_PATH, "rb") as f:
                existing_project_data = tomli.load(f)
        except FileNotFoundError:
            existing_project_data = {}

        # Apply changes onto existing data, i.e. PATCH semantics.
        existing_project_data.update(project_data_dict)

        # Open the file in binary write mode to write the TOML data
        with open(PROJECT_INFO_TOML_PATH, "wb") as f:
            tomli_w.dump(existing_project_data, f)

        return None

    except IOError as e:
        # This catches errors related to file operations (e.g., permissions, disk full)
        error_message = f"Failed to write project information to file: {str(e)}"
        print(error_message)  # Log server-side
        raise e
    except Exception as e:  # Catch any other unexpected errors
        error_message = (
            f"An unexpected error occurred while saving project info: {str(e)}"
        )
        print(error_message)  # Log server-side
        raise e


class RGlobRequest(BaseModel):
    baseDir: Path
    pattern: str
    noDirs: bool = False
    stat: bool = False


class RGlobResponseEntry(BaseModel):
    path: Path

    # Present only if request had stat=True or noDirs=True
    type: str | None

    # Present only if request had stat=True

    size: int | None
    # Creation timestamp, ISO format.
    cTime: str | None
    # Modified timestamp, ISO format.
    mTime: str | None


class RGlobResponse(BaseModel):
    entries: list[RGlobResponseEntry]
    relativeTo: Path  # this is going to be the same base_dir that was in the request.


@app.post("/app/v0/rpc/rglob")
def rglob(request: RGlobRequest) -> RGlobResponse:
    # Prevent secrets like /etc/passwd and ~/.ssh/ from being leaked.
    if not (request.pattern.endswith(".csv") or request.pattern.endswith(".mp4")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only csv and mp4 files are supported.",
        )

    response = RGlobResponse(entries=[], relativeTo=request.baseDir)

    results = super_rglob(
        str(request.baseDir),
        pattern=request.pattern,
        no_dirs=request.noDirs,
        stat=request.stat,
    )
    for r in results:
        # Convert dict to pydantic model
        converted = RGlobResponseEntry.model_validate(r)
        response.entries.append(converted)

    return response


class FFProbeRequest(BaseModel):
    path: Path


class FFProbeResponse(BaseModel):
    codec: str
    width: int
    height: int
    fps: int
    duration: float


@app.post("/app/v0/rpc/ffprobe")
def ffprobe(request: FFProbeRequest) -> FFProbeResponse:
    if request.path.suffix != ".mp4":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only mp4 files are supported.",
        )

    result = run_ffprobe(str(request.path))

    response = FFProbeResponse.model_validate(result)

    return response


"""
File server to serve csv and video files.
FileResponse supports range requests for video buffering.
For security - only supports reading out of data_dir and model_dir
If we need to read out of other directories, they should be added to Project Info.
"""


@app.get("/app/v0/files/{file_path:path}")
def read_file(file_path: Path):
    # Prevent secrets like /etc/passwd and ~/.ssh/ from being leaked.
    if file_path.suffix not in (".csv", ".mp4"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only csv and mp4 files are supported.",
        )
    file_path = Path("/") / file_path

    # Only capable of returning files that exist (not directories).
    if not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    return FileResponse(file_path)


###########################################################################
# Serving angular
#
# In dev mode, `ng serve` serves ng, and proxies to us for backend requests.
# In production mode, we will serve ng.
# This is necessary to use HTTP2 for faster concurrent request performance (ng serve doesn't support it).
###########################################################################

# Serve ng assets (js, css)
STATIC_DIR = Path(__file__).parent / "ngdist" / "ng_app"
if not STATIC_DIR.is_dir():
    message = dedent(
        f"""
        ⚠️  Warning: We couldn't find the necessary static assets (like HTML, CSS, JavaScript files).
        As a result, only the HTTP API is currently running.

        This usually happens if you've cloned the source code directly.
        To fix this and get the full application working, you'll need to either:

        - Build the application: Refer to development.md in the repository for steps.
        - Copy static files: Obtain these files from a PyPI source distribution of a released
        version and place them in:

            {STATIC_DIR}
        """
    )
    # print(f'{Fore.white}{Back.yellow}{message}{Style.reset}', file=sys.stderr)
    print(f"{message}", file=sys.stderr)

app.mount("/static", StaticFiles(directory=STATIC_DIR, check_dir=False), name="static")


@app.get("/favicon.ico")
def favicon():
    return FileResponse(Path(__file__).parent / "ngdist" / "ng_app" / "favicon.ico")


# Catch-all route. serve index.html.
@app.get("/{full_path:path}")
def index(full_path: Path):
    return FileResponse(Path(__file__).parent / "ngdist" / "ng_app" / "index.html")


def get_static_files_if_needed():
    cache_dir = Path("~/.lightning_pose/cache").expanduser()
    # Version check
    # App should run with "latest compatible version"
    # this means that if lightning pose is installed, it gets the latest version compatible with that version.
    # otherwise it gets just the latest version.
    # Download the files?


def run_app(host: str, port: int):
    get_static_files_if_needed()
    uvicorn.run(app, host=host, port=port)
