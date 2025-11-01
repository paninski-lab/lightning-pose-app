import sys
import signal
from waitress import serve
from litpose_app import deps
from litpose_app.flask_app import app
import importlib.resources as pkg_resources
import threading
import os
import psutil

# Global variable to store the Caddy process
caddy_process: psutil.Popen | None = None

def start_caddy():
    global caddy_process
    config = deps.config()
    print("🚀 [Before Start Hook] Launching Caddy server...")

    # Use the packaged Caddyfile from resources
    caddyfile_path = pkg_resources.files('litpose_app').joinpath('resources', 'Caddyfile')

    # Start Caddy using the on-disk Caddyfile (no stdin templating)
    caddy_process = psutil.Popen(
        [str(config.CADDY_BIN_PATH), 'run', '--config', str(caddyfile_path), '--adapter', 'caddyfile'],
    )

    def monitor_caddy():
        ret = caddy_process.wait()
        print(f"❌ Caddy server exited with return code {ret}")
        os._exit(1)

    threading.Thread(target=monitor_caddy, daemon=True).start()

def _terminate_tree(proc: psutil.Popen, timeout: float = 5.0):
    try:
        # Terminate children first
        for child in proc.children(recursive=True):
            try:
                child.terminate()
            except Exception:
                pass
        _, alive = psutil.wait_procs(proc.children(recursive=True), timeout=timeout)
        for a in alive:
            try:
                a.kill()
            except Exception:
                pass
        # Then terminate the root
        try:
            proc.terminate()
        except Exception:
            pass
        try:
            proc.wait(timeout=timeout)
        except psutil.TimeoutExpired:
            try:
                proc.kill()
            except Exception:
                pass
    except Exception:
        pass

def cleanup_caddy():
    global caddy_process
    if caddy_process:
        print("Terminating Caddy server...")
        _terminate_tree(caddy_process)
        caddy_process = None

def before_start_hook():
    """Function to run immediately before the Waitress server starts blocking."""
    print("🤖 [Before Start Hook] Performing necessary initialization...")
    start_caddy()
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

def main():
    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)
    try:
        before_start_hook()
        print("--- Starting Waitress Server (Blocking) ---")
        # Use a different port than Caddy to avoid conflicts
        serve(
            app,
            host='0.0.0.0',
            port=5000,
            threads=10
        )
    except SystemExit:
        pass
    finally:
        after_end_hook()

if __name__ == '__main__':
    main()