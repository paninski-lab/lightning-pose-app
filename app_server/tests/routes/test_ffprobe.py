import json
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from pathlib import Path

def test_run_ffprobe_unit():
    from litpose_app.routes.ffprobe import run_ffprobe

    with patch("subprocess.run") as mock_run:
        mock_proc = MagicMock()
        mock_proc.returncode = 0

        # Mock metadata
        metadata = {
            "format": {
                "duration": "10.0",
                "size": "1000",
                "bit_rate": "1000000",
                "format_name": "mp4",
            },
            "streams": [
                {
                    "codec_name": "h264",
                    "width": 1280,
                    "height": 720,
                    "avg_frame_rate": "30/1",
                    "r_frame_rate": "30/1",
                }
            ],
            "frames": [{"pict_type": "I"}, {"pict_type": "I"}, {"pict_type": "P"}],
        }
        mock_proc.stdout = json.dumps(metadata)
        mock_run.return_value = mock_proc

        result = run_ffprobe("dummy.mp4")
        assert result["is_all_intra"] is False
        assert result["duration"] == 10.0

        # Verify ffprobe command
        args, kwargs = mock_run.call_args
        command = args[0]
        assert "-read_intervals" in command
        assert "%+10" in command
        assert "frame=pict_type" in command[command.index("-show_entries") + 1]

        # Test case: All intra
        metadata["frames"] = [{"pict_type": "I"}] * 5
        mock_proc.stdout = json.dumps(metadata)
        result = run_ffprobe("dummy.mp4")
        assert result["is_all_intra"] is True

        # Test case: Respects max_frames heuristic (first 60 are I, 61st is P)
        metadata["frames"] = [{"pict_type": "I"}] * 60 + [{"pict_type": "P"}]
        mock_proc.stdout = json.dumps(metadata)
        result = run_ffprobe("dummy.mp4")
        assert result["is_all_intra"] is True

def test_ffprobe_endpoint(client: TestClient, register_project, tmp_path):
    project_key = "test_proj"
    register_project(project_key)
    
    # Create a dummy mp4 file
    video_path = tmp_path / "test_video.mp4"
    video_path.write_text("dummy video content")
    
    with patch("litpose_app.routes.ffprobe.run_ffprobe") as mock_run:
        mock_run.return_value = {
            "file_path": str(video_path),
            "duration": 10.0,
            "width": 1280,
            "height": 720,
            "fps": 30,
            "format": "mov,mp4",
            "size": 1000,
            "codec": "h264",
            "is_vfr": False,
            "bitrate_str": "1.0 Mbps",
            "dar": "16:9",
            "sar": "1:1",
            "color_space": "bt709",
            "is_all_intra": True,
        }
        
        response = client.post(
            "/app/v0/rpc/ffprobe",
            json={
                "projectKey": project_key,
                "path": str(video_path),
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["is_all_intra"] is True
        assert data["width"] == 1280

def test_ffprobe_not_mp4(client: TestClient, register_project):
    project_key = "test_proj"
    register_project(project_key)
    
    response = client.post(
        "/app/v0/rpc/ffprobe",
        json={
            "projectKey": project_key,
            "path": "test_video.avi",
        }
    )
    assert response.status_code == 403
    assert "Only mp4 files are supported" in response.json()["detail"]
