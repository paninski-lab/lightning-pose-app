"""run_eks.py runs EKS with JAX in 64-bit floats."""

from __future__ import annotations

import sys
import types

import jax
import pytest

from litpose_app.scripts import run_eks


class _Called(Exception):
    pass


@pytest.fixture
def jax_x64_restored():
    before = jax.config.jax_enable_x64
    jax.config.update("jax_enable_x64", False)
    yield
    jax.config.update("jax_enable_x64", before)


@pytest.mark.parametrize(
    ("module", "func", "cams"),
    [
        ("eks.multicam_smoother", "fit_eks_multicam", ["top", "bot"]),
        ("eks.singlecam_smoother", "fit_eks_singlecam", []),
    ],
)
def test_eks_is_called_with_jax_64_bit(
    module, func, cams, tmp_path, monkeypatch, jax_x64_restored
):
    # 32-bit EKS returns NaN for whole keypoints when smooth_param is large and
    # members agree closely; 64-bit does not.
    seen: dict[str, bool] = {}

    def fake_fit(**_kwargs):
        seen["x64"] = jax.config.jax_enable_x64
        raise _Called

    monkeypatch.setitem(sys.modules, module, types.SimpleNamespace(**{func: fake_fit}))
    argv = ["run_eks.py", "--save_dir", str(tmp_path), "--input_files", "s_top.csv", "s_bot.csv"]
    if cams:
        argv += ["--camera_names", *cams]
    monkeypatch.setattr(sys, "argv", argv)

    with pytest.raises(_Called):
        run_eks.main()
    assert seen["x64"] is True
