from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor

from litpose_app.config import Config
from .models import BundleAdjustRequest, BundleAdjustResponse
from .project import get_project_info

# Reuse the well-tested implementation from the FastAPI module.
from litpose_app.routes.labeler.bundle_adjust import _bundle_adjust_impl  # type: ignore


def bundle_adjust_logic(request: BundleAdjustRequest, config: Config) -> BundleAdjustResponse:
    """Run bundle adjustment in a separate process and return summarized metrics.

    Delegates heavy computation to the existing implementation from the FastAPI
    module to avoid code duplication. This function provides the Flask-facing
    business logic wrapper and typed response.
    """
    project_info = get_project_info(config).projectInfo

    with ProcessPoolExecutor(max_workers=1) as executor:
        fut = executor.submit(
            _bundle_adjust_impl,
            request,
            project_info,  # Duck-typed: has data_dir and views fields
            config,
        )
        result = fut.result()

    return BundleAdjustResponse.model_validate(result)
