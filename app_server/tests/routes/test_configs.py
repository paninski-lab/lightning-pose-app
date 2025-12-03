from fastapi.testclient import TestClient
import yaml


def test_get_default_config(client: TestClient):
    """Test that we can retrieve the default single-view config."""
    response = client.get("/app/v0/configs/default")
    assert response.status_code == 200
    data = response.json()

    # Basic checks on structure to ensure it's the correct config
    assert "data" in data
    assert "model" in data
    assert "training" in data

    # Check for a known key specific to single view or generally present
    # e.g., confirming view_names is not a list of multiple items or just checking defaults
    # For single view default, usually backbone is defined
    assert "backbone" in data["model"]


def test_get_default_multiview_config(client: TestClient):
    """Test that we can retrieve the default multiview config."""
    response = client.get("/app/v0/configs/default_multiview")
    assert response.status_code == 200
    data = response.json()

    assert "data" in data
    assert "model" in data

    # Multiview config usually has view_names or specific multiview model types
    # We can check if it parses correctly
    assert isinstance(data, dict)
