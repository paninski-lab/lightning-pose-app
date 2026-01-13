import logging
import os
import sys
from textwrap import dedent

logger = logging.getLogger(__name__)


def check_for_upgrade():
    if os.environ.get("LP_IGNORE_UPGRADE") == "1":
        logger.info(f"LP_IGNORE_UPGRADE=1 present, Skipping upgrade check ")
        return

    import json
    import urllib.request
    from packaging import version
    import importlib.metadata

    package_name = "lightning-pose-app"
    try:
        current_version = importlib.metadata.version(package_name)
        # Fetch latest version from PyPI
        with urllib.request.urlopen(
            f"https://pypi.org/pypi/{package_name}/json", timeout=2
        ) as response:
            data = json.load(response)
            latest_version = data["info"]["version"]

        if version.parse(latest_version) > version.parse(current_version):
            print(
                dedent(
                    f"""
                {'-' * 80}
                🚀 A new version of {package_name} is available: {latest_version} (current: {current_version})
                
                To upgrade, run:
                    pip install --upgrade {package_name}

                To skip this check in the future, use the LP_IGNORE_UPGRADE env variable:
                    LP_IGNORE_UPGRADE=1 litpose run_app
                {'-' * 80}
            """
                )
            )

            sys.exit(0)
    except Exception as e:
        # Don't block startup if PyPI is down or package isn't installed via pip
        logger.info(f"Upgrade check failed: {e}")
