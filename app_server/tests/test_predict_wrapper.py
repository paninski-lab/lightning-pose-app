import os
import subprocess
import sys
import pytest
import json

@pytest.fixture
def wrapper_paths():
    return {
        "wrapper": os.path.abspath("app_server/src/litpose_app/utils/inference/predict_wrapper.py"),
        "fake": os.path.abspath("app_server/src/litpose_app/utils/inference/fake_predict.py")
    }

def create_model_dir(tmp_path, name, model_type, backbone="resnet50"):
    model_dir = tmp_path / name
    model_dir.mkdir()
    config_path = model_dir / "config.yaml"
    config_path.write_text(f"model:\n  model_type: {model_type}\n  backbone: {backbone}\n")
    return str(model_dir)

def run_wrapper(wrapper_path, model_dir, extra_args=None):
    if extra_args is None:
        extra_args = []
    
    # We use conda run -n lp to ensure 'yaml' is available in the wrapper
    cmd = ["conda", "run", "-n", "lp", sys.executable, wrapper_path, "--fake", model_dir, "dummy_video.mp4"] + extra_args
    
    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )
    return result

def test_normal_model_flag(tmp_path, wrapper_paths):
    model_dir = create_model_dir(tmp_path, "normal_model", "heatmap")
    result = run_wrapper(wrapper_paths["wrapper"], model_dir)
    assert "Using standard flag dali.base.predict.sequence_length" in result.stdout
    assert "dali.base.predict.sequence_length=64" in result.stdout
    assert result.returncode == 0

def test_context_model_flag(tmp_path, wrapper_paths):
    model_dir = create_model_dir(tmp_path, "context_model", "heatmap_mhcrnn")
    result = run_wrapper(wrapper_paths["wrapper"], model_dir)
    assert "Detected context model, using dali.context.predict.sequence_length" in result.stdout
    assert "dali.context.predict.sequence_length=64" in result.stdout
    assert result.returncode == 0

def test_oom_retry_logic_with_context(tmp_path, wrapper_paths):
    model_dir = create_model_dir(tmp_path, "context_model_oom", "heatmap_mhcrnn")
    result = run_wrapper(wrapper_paths["wrapper"], model_dir, ["--initial_batch_size", "16"])
    
    assert "Detected CUDA out of memory with batch size 16" in result.stdout
    assert "Retrying with batch size 8" in result.stdout
    assert "Success with batch size 8" in result.stdout
    assert "dali.context.predict.sequence_length=16" in result.stdout
    assert "dali.context.predict.sequence_length=8" in result.stdout

def test_non_oom_error_stops_retry(tmp_path, wrapper_paths):
    model_dir = create_model_dir(tmp_path, "normal_model", "heatmap")
    result = run_wrapper(wrapper_paths["wrapper"], model_dir, ["--initial_batch_size", "7"])
    
    assert "Error: Some other critical failure." in result.stdout
    assert "Command failed with return code 1 (not an OOM error)" in result.stdout
    assert result.returncode == 1

def test_caching_logic(tmp_path, wrapper_paths):
    # Clear cache first
    cache_file = "/tmp/litpose_predict_batch_size_cache.json"
    if os.path.exists(cache_file):
        os.remove(cache_file)
    
    model_dir = create_model_dir(tmp_path, "cache_model", "heatmap", backbone="resnet18")
    
    # First run: start with 16, it fails (fake_predict OOMs > 8), retries with 8, succeeds.
    result = run_wrapper(wrapper_paths["wrapper"], model_dir, ["--initial_batch_size", "16"])
    assert "Success with batch size 8" in result.stdout
    
    # Check if cache file exists and has the value
    assert os.path.exists(cache_file)
    with open(cache_file, "r") as f:
        cache = json.load(f)
    assert cache["resnet18_context_False"] == 8
    
    # Second run: should use cached value 8 without retry
    result2 = run_wrapper(wrapper_paths["wrapper"], model_dir)
    assert "Using cached batch size 8 for resnet18_context_False" in result2.stdout
    assert "Success with batch size 8" in result2.stdout
    assert "Retrying" not in result2.stdout

    # Third run: different backbone, should NOT use the cached value for resnet18
    model_dir_2 = create_model_dir(tmp_path, "other_model", "heatmap", backbone="resnet34")
    result3 = run_wrapper(wrapper_paths["wrapper"], model_dir_2, ["--initial_batch_size", "8"])
    assert "Using cached batch size 8 for resnet18_context_False" not in result3.stdout
    
    # Clean up
    if os.path.exists(cache_file):
        os.remove(cache_file)
