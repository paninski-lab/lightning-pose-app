import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from textwrap import dedent

import uvicorn
from fastapi import FastAPI, HTTPException, APIRouter, Request
from fastapi.responses import FileResponse
from starlette import status
from starlette.responses import Response
from starlette.staticfiles import StaticFiles

from . import deps
from .tasks.management import setup_active_task_registry

## Setup logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


## Configure additional things to happen on server startup and shutdown.
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start apscheduler, which is responsible for executing background tasks
    logger.info("Application startup: Initializing scheduler...")
    scheduler = deps.scheduler()
    app.state.scheduler = scheduler
    scheduler.start()
    setup_active_task_registry(app)

    yield  # Application is now ready to receive requests

    logger.info("Application shutdown: Shutting down scheduler...")
    if scheduler and scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler shut down.")
    else:
        logger.warning("Scheduler not found or not running during shutdown.")


app = FastAPI(lifespan=lifespan)

router = APIRouter()
from .routes import ffprobe, files, project, transcode

router.include_router(ffprobe.router)
router.include_router(files.router)
router.include_router(project.router)
router.include_router(transcode.router)
app.include_router(router)


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
        """
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
async def favicon():
    return FileResponse(Path(__file__).parent / "ngdist" / "ng_app" / "favicon.ico")


# Catch-all route. serve index.html.
@app.get("/{full_path:path}")
async def index():
    return FileResponse(Path(__file__).parent / "ngdist" / "ng_app" / "index.html")


def run_app(host: str, port: int):
    uvicorn.run(app, host=host, port=port)
