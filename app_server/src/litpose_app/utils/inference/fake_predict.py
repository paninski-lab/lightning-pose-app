import argparse
import sys

def main():
    # Setup parser to handle litpose predict-like arguments
    parser = argparse.ArgumentParser(description="Fake litpose predict for testing OOM handling.")
    parser.add_argument("model_dir", help="Path to the model directory")
    parser.add_argument("video_paths", nargs="*", help="Paths to video files")
    parser.add_argument("--skip_viz", action="store_true", help="Skip visualization")
    parser.add_argument("--overrides", help="Hydra-style overrides")

    args, unknown = parser.parse_known_args()

    # Extract batch size from overrides if present
    batch_size = 64  # Default
    if args.overrides:
        # dali.base.predict.sequence_length or dali.context.predict.sequence_length
        for flag in ["dali.base.predict.sequence_length=", "dali.context.predict.sequence_length="]:
            if flag in args.overrides:
                try:
                    parts = args.overrides.split(flag)
                    if len(parts) > 1:
                        # Split by comma or space in case there are other overrides
                        val_str = parts[1].split(",")[0].split()[0]
                        batch_size = int(val_str)
                        break
                except (ValueError, IndexError):
                    pass

    print(f"DEBUG: fake_predict.py called with batch_size={batch_size}")

    # Simulate other errors
    if batch_size == 7:
        print("Error: Some other critical failure.")
        sys.exit(1)

    # Simulate CUDA OOM if batch size is too large
    if batch_size > 8:
        print("Error: CUDA out of memory. Tried to allocate 2.45 GiB (GPU 0; 8.00 GiB total capacity; 5.67 GiB already allocated; 1.23 GiB free; 5.70 GiB reserved in total by PyTorch)")
        sys.exit(1)
    else:
        print(f"Success! Prediction completed with batch size {batch_size}.")
        sys.exit(0)

if __name__ == "__main__":
    main()
