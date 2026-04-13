"""
Tests for /api/cron/notify-waitlist endpoint.
"""
import os
import requests
import pytest
from dotenv import load_dotenv

_env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env.local")
load_dotenv(_env_path)
CRON_SECRET = os.getenv("CRON_SECRET", "")


class TestCronNotifyWaitlist:
    """Waitlist notification cron job."""

    def test_requires_cron_secret(self, app_url):
        """POST without cron secret → 401."""
        resp = requests.post(
            f"{app_url}/api/cron/notify-waitlist",
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 401

    def test_wrong_cron_secret(self, app_url):
        """POST with wrong secret → 401."""
        resp = requests.post(
            f"{app_url}/api/cron/notify-waitlist",
            headers={"Content-Type": "application/json", "x-cron-secret": "wrong"},
        )
        assert resp.status_code == 401

    def test_notify_with_valid_secret(self, app_url):
        """POST with valid secret → 200."""
        assert CRON_SECRET, "CRON_SECRET not in .env.local"
        resp = requests.post(
            f"{app_url}/api/cron/notify-waitlist",
            headers={"Content-Type": "application/json", "x-cron-secret": CRON_SECRET},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert "notified_count" in body["data"]

    def test_empty_waitlist(self, app_url):
        """With no waitlist entries, returns 0 notified."""
        assert CRON_SECRET, "CRON_SECRET not in .env.local"
        resp = requests.post(
            f"{app_url}/api/cron/notify-waitlist",
            headers={"Content-Type": "application/json", "x-cron-secret": CRON_SECRET},
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["notified_count"] == 0
