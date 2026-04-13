"""
Tests for cron job API routes.
"""
import os
import requests
import pytest
from dotenv import load_dotenv

# Load CRON_SECRET from .env.local
_env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env.local")
load_dotenv(_env_path)
CRON_SECRET = os.getenv("CRON_SECRET", "")


class TestCronAPI:
    """Cron job endpoints authentication and execution."""

    # ── expire-trials ──

    def test_expire_trials_no_secret(self, app_url):
        """POST /api/cron/expire-trials without x-cron-secret should return 401."""
        resp = requests.post(
            f"{app_url}/api/cron/expire-trials",
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 401, (
            f"Expected 401 without cron secret, got {resp.status_code}: {resp.text}"
        )

    def test_expire_trials_wrong_secret(self, app_url):
        """POST /api/cron/expire-trials with wrong secret should return 401."""
        resp = requests.post(
            f"{app_url}/api/cron/expire-trials",
            headers={
                "Content-Type": "application/json",
                "x-cron-secret": "totally-wrong-secret",
            },
        )
        assert resp.status_code == 401, (
            f"Expected 401 with wrong cron secret, got {resp.status_code}: {resp.text}"
        )

    def test_expire_trials_with_secret(self, app_url):
        """POST /api/cron/expire-trials with correct CRON_SECRET should return 200."""
        assert CRON_SECRET, "CRON_SECRET not found in .env.local"
        resp = requests.post(
            f"{app_url}/api/cron/expire-trials",
            headers={
                "Content-Type": "application/json",
                "x-cron-secret": CRON_SECRET,
            },
        )
        assert resp.status_code == 200, (
            f"Expected 200 with valid cron secret, got {resp.status_code}: {resp.text}"
        )

    # ── send-followups ──

    def test_send_followups_with_secret(self, app_url):
        """POST /api/cron/send-followups with correct secret should return 200."""
        assert CRON_SECRET, "CRON_SECRET not found in .env.local"
        resp = requests.post(
            f"{app_url}/api/cron/send-followups",
            headers={
                "Content-Type": "application/json",
                "x-cron-secret": CRON_SECRET,
            },
        )
        assert resp.status_code == 200, (
            f"Expected 200 for send-followups, got {resp.status_code}: {resp.text}"
        )

    # ── send-birthdays ──

    def test_send_birthdays_with_secret(self, app_url):
        """POST /api/cron/send-birthdays with correct secret should return 200."""
        assert CRON_SECRET, "CRON_SECRET not found in .env.local"
        resp = requests.post(
            f"{app_url}/api/cron/send-birthdays",
            headers={
                "Content-Type": "application/json",
                "x-cron-secret": CRON_SECRET,
            },
        )
        assert resp.status_code == 200, (
            f"Expected 200 for send-birthdays, got {resp.status_code}: {resp.text}"
        )

    # ── cleanup-states ──

    def test_cleanup_states_with_secret(self, app_url):
        """POST /api/cron/cleanup-states with correct secret should return 200."""
        assert CRON_SECRET, "CRON_SECRET not found in .env.local"
        resp = requests.post(
            f"{app_url}/api/cron/cleanup-states",
            headers={
                "Content-Type": "application/json",
                "x-cron-secret": CRON_SECRET,
            },
        )
        assert resp.status_code == 200, (
            f"Expected 200 for cleanup-states, got {resp.status_code}: {resp.text}"
        )
