import sys
import signal
from pathlib import Path

from waitress import serve
from litpose_app import deps
from litpose_app.flask_app import app
import importlib.resources as pkg_resources
import threading
import psutil
import subprocess  # Import subprocess for DEVNULL

# Global variable to store the Caddy process
caddy_process: psutil.Popen | None = None

def start_caddy(show_output: bool):
    global caddy_process
    config = deps.config()
    print("🚀 [Before Start Hook] Launching Caddy server...")

    # Use the packaged Caddyfile from resources
    caddyfile_path = pkg_resources.files('litpose_app').joinpath('resources', 'Caddyfile')

    ANGULAR_BUILD_DIR = Path(__file__).parent / "ngdist" / "ng_app" / "browser"

    # Determine where to redirect stdout/stderr
    stdout_target = None if show_output else subprocess.DEVNULL
    stderr_target = None if show_output else subprocess.DEVNULL

    # Start Caddy using the on-disk Caddyfile (no stdin templating)
    caddy_process = psutil.Popen(
        [str(config.CADDY_BIN_PATH), 'run', '--config', str(caddyfile_path), '--adapter', 'caddyfile'],
        stdout=stdout_target,
        stderr=stderr_target,
        env={'ANGULAR_BUILD_DIR': str(ANGULAR_BUILD_DIR)}
    )

    def monitor_caddy():
        ret = caddy_process.wait()
        print(f"❌ Caddy server exited with return code {ret}")
        sys.exit(1)

    threading.Thread(target=monitor_caddy, daemon=True).start()

def cleanup_caddy():
    global caddy_process
    if caddy_process:
        print("Terminating Caddy server...")
        try:
            # Attempt to terminate the Caddy process
            caddy_process.terminate()
            # Wait for Caddy to terminate gracefully, with a timeout
            caddy_process.wait(timeout=5)
        except psutil.TimeoutExpired:
            print("Caddy process did not terminate gracefully within 5 seconds, killing...")
            # If it didn't terminate, forcefully kill it
            caddy_process.kill()
        except Exception as e:
            print(f"Error encountered during Caddy process termination: {e}")
        finally:
            caddy_process = None

def before_start_hook(show_caddy_output: bool):
    """Function to run immediately before the Waitress server starts blocking."""
    print("🤖 [Before Start Hook] Performing necessary initialization...")
    start_caddy(show_caddy_output)
    print("✅ Initialization complete. Server is ready to bind ports.")

def after_end_hook():
    """Function to run immediately after the Waitress server shuts down."""
    print("🛑 [After End Hook] Performing cleanup tasks...")
    cleanup_caddy()
    print("🧹 Cleanup complete. Exiting program.")

def shutdown_handler(signum, frame):
    """Handles signals (e.g., Ctrl+C, kill) to trigger cleanup."""
    print("\n⚠️ Signal received, attempting graceful shutdown...")
    sys.exit(0)

def main(show_caddy_output: bool = True):
    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)
    try:
        before_start_hook(show_caddy_output)
        print("--- Starting Waitress Server (Blocking) ---")
        # Use a different port than Caddy to avoid conflicts
        serve(
            app,
            host='0.0.0.0',
            port=5000,
            threads=10,
            url_prefix='/app/v0/rpc',
        )
    except SystemExit:
        pass
    finally:
        after_end_hook()

if __name__ == '__main__':
    main(show_caddy_output=False)