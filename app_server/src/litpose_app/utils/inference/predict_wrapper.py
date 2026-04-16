import argparse
import os
import subprocess
import sys
import json

CACHE_FILE = "/tmp/litpose_predict_batch_size_cache.json"

def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_to_cache(key, value):
    cache = load_cache()
    cache[key] = value
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(cache, f)
    except Exception as e:
        print(f"Warning: Could not save cache to {CACHE_FILE}: {e}")

def main():
    # Use parse_known_args to separate wrapper-specific args from litpose args
    parser = argparse.ArgumentParser(description="Wrapper for litpose predict to handle CUDA OOM.")
    parser.add_argument("--fake", action="store_true", help="Use fake_predict.py instead of litpose")
    parser.add_argument("--initial_batch_size", type=int, help="Initial batch size")
    
    # The rest of the arguments will be passed to litpose predict
    args, litpose_args = parser.parse_known_args()

    fake = args.fake
    
    # Identify model_dir to determine the correct override flag and cache key
    model_dir_path = None
    for arg in litpose_args:
        if not arg.startswith("-"):
            model_dir_path = arg
            break
    
    override_flag = "dali.base.predict.sequence_length"
    backbone = "unknown"
    is_context = False

    if model_dir_path:
        config_path = os.path.join(model_dir_path, "config.yaml")
        if os.path.exists(config_path):
            try:
                import yaml
                with open(config_path, "r") as f:
                    config = yaml.safe_load(f)
                
                # Check for backbone
                backbone = config.get("model", {}).get("backbone", "unknown")
                
                # Check for context model
                model_type = config.get("model", {}).get("model_type", "")
                if isinstance(model_type, str) and model_type.endswith("_mhcrnn"):
                    is_context = True
                    override_flag = "dali.context.predict.sequence_length"
                    print(f"--- Detected context model, using {override_flag} ---")
                else:
                    print(f"--- Using standard flag {override_flag} ---")
            except ImportError:
                print("Warning: 'yaml' module not found. Defaulting to dali.base.predict.sequence_length.")
            except Exception as e:
                print(f"Warning: Could not read config.yaml at {config_path}: {e}")
    
    cache_key = f"{backbone}_context_{is_context}"
    
    # Starting batch size
    if args.initial_batch_size is not None:
        batch_size = args.initial_batch_size
    else:
        cache = load_cache()
        if cache_key in cache:
            batch_size = cache[cache_key]
            print(f"--- Using cached batch size {batch_size} for {cache_key} ---")
        else:
            batch_size = 64
    
    while batch_size >= 1:
        # Construct the command
        if fake:
            fake_path = os.path.join(os.path.dirname(__file__), "fake_predict.py")
            cmd = [sys.executable, fake_path]
        else:
            cmd = ["litpose", "predict"]
        
        # Add litpose-specific arguments
        cmd.extend(litpose_args)
        
        # Add batch size override
        cmd.append(f"--overrides={override_flag}={batch_size}")
        
        print(f"--- Running prediction with batch size {batch_size} ---")
        print(f"Command: {' '.join(cmd)}")
        
        # Execute and capture output
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )
        
        output_log = []
        oom_detected = False
        
        for line in process.stdout:
            print(line, end="")
            output_log.append(line)
            if "CUDA out of memory" in line:
                oom_detected = True
        
        process.wait()
        ret_code = process.returncode
        
        if ret_code == 0:
            print(f"--- Success with batch size {batch_size} ---")
            save_to_cache(cache_key, batch_size)
            sys.exit(0)
        
        if oom_detected:
            print(f"\n!!! Detected CUDA out of memory with batch size {batch_size} !!!")
            batch_size //= 2
            if batch_size < 1:
                print("Error: Batch size reduced to 0, still failing.")
                sys.exit(ret_code)
            print(f"--- Retrying with batch size {batch_size} ---\n")
            continue
        else:
            print(f"--- Command failed with return code {ret_code} (not an OOM error) ---")
            sys.exit(ret_code)

    print("Error: Could not complete prediction even with minimum batch size.")
    sys.exit(1)

if __name__ == "__main__":
    main()
