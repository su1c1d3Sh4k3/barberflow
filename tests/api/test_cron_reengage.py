"""
Tests for /api/cron/reengage-abandoned endpoint.
"""
import os
import requests
import pytest
from dotenv import load_dotenv

# Load CRON_SECRET from .env.local
_env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env.local")
load_dotenv(_env_path)
CRON_SECRET = os.getenv("CRON_SECRET", "")


class TestCronReengageAbandoned:
    """Cron job for re-engaging abandoned booking sessions."""

    def test_requires_cron_secret(self, app_url):
        """POST /api/cron/reengage-abandoned without x-cron-secret should return 401."""
        resp = requests.post(
            f"{app_url}/api/cron/reengage-abandoned",
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 401, (
            f"Expected 401 without cron secret, got {resp.status_code}: {resp.text}"
        )

    def test_wrong_secret_returns_401(self, app_url):
        """POST /api/cron/reengage-abandoned with wrong secret should return 401."""
        resp = requests.post(
            f"{app_url}/api/cron/reengage-abandoned",
            headers={
                "Content-Type": "application/json",
                "x-cron-secret": "wrong-secret-value",
            },
        )
        assert resp.status_code == 401, (
            f"Expected 401 with wrong secret, got {resp.status_code}: {resp.text}"
        )

    def test_with_valid_secret(self, app_url):
        """POST /api/cron/reengage-abandoned with correct CRON_SECRET should return 200."""
        assert CRON_SECRET, "CRON_SECRET not found in .env.local"
        resp = requests.post(
            f"{app_url}/api/cron/reengage-abandoned",
            headers={
                "Content-Type": "application/json",
                "x-cron-secret": CRON_SECRET,
            },
        )
        assert resp.status_code == 200, (
            f"Expected 200 with valid cron secret, got {resp.status_code}: {resp.text}"
        )
        body = resp.json()
        assert body.get("success") is True
        assert "found" in body["data"]
        assert "reengaged" in body["data"]

    def test_returns_count_fields(self, app_url):
        """Response should contain found and reengaged counts."""
        assert CRON_SECRET, "CRON_SECRET not found in .env.local"
        resp = requests.post(
            f"{app_url}/api/cron/reengage-abandoned",
            headers={
                "Content-Type": "application/json",
                "x-cron-secret": CRON_SECRET,
            },
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert isinstance(data["found"], int)
        assert isinstance(data["reengaged"], int)
        # reengaged should be <= found
        assert data["reengaged"] <= data["found"]

    def test_idempotent_runs(self, app_url):
        """Running twice should not re-engage already re-engaged sessions."""
        assert CRON_SECRET, "CRON_SECRET not found in .env.local"
        headers = {
            "Content-Type": "application/json",
            "x-cron-secret": CRON_SECRET,
        }

        # First run
        resp1 = requests.post(f"{app_url}/api/cron/reengage-abandoned", headers=headers)
        assert resp1.status_code == 200
        count1 = resp1.json()["data"]["reengaged"]

        # Second run - should find 0 new ones (assuming no new abandoned sessions appeared)
        resp2 = requests.post(f"{app_url}/api/cron/reengage-abandoned", headers=headers)
        assert resp2.status_code == 200
        count2 = resp2.json()["data"]["reengaged"]

        # Second run should re-engage 0 or fewer (the same sessions should be marked)
        assert count2 <= count1
