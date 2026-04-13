"""
Backend tests for trial expiry logic via the cron endpoint.
"""
import os
import requests
import pytest
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

_env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env.local")
load_dotenv(_env_path)
CRON_SECRET = os.getenv("CRON_SECRET", "")


class TestCronExpireTrials:
    """Verify that the expire-trials cron correctly updates subscription statuses."""

    def _cron_headers(self):
        return {
            "Content-Type": "application/json",
            "x-cron-secret": CRON_SECRET,
        }

    def test_create_expired_trial(self, supabase_url, supabase_headers, test_tenant):
        """Insert subscription with trial_ends_at = yesterday, verify it exists."""
        tenant_id = test_tenant["tenant_id"]
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()

        requests.delete(
            f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}",
            headers={**supabase_headers, "Prefer": ""},
        )
        resp = requests.post(
            f"{supabase_url}/rest/v1/subscriptions",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "status": "trial",
                "trial_ends_at": yesterday,
                "plan_id": None,
            },
        )
        assert resp.status_code in (200, 201), f"Failed to create subscription: {resp.text}"
        sub = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
        assert sub["status"] == "trial", "Initial status should be 'trial'"

        # Cleanup
        requests.delete(
            f"{supabase_url}/rest/v1/subscriptions?id=eq.{sub['id']}",
            headers={**supabase_headers, "Prefer": ""},
        )

    def test_cron_marks_expired(self, app_url, supabase_url, supabase_headers, test_tenant):
        """Call the cron endpoint, verify subscription.status changed to 'expired'."""
        assert CRON_SECRET, "CRON_SECRET not found in .env.local"
        tenant_id = test_tenant["tenant_id"]
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()

        # Insert expired trial
        requests.delete(
            f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}",
            headers={**supabase_headers, "Prefer": ""},
        )
        resp = requests.post(
            f"{supabase_url}/rest/v1/subscriptions",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "status": "trial",
                "trial_ends_at": yesterday,
                "plan_id": None,
            },
        )
        assert resp.status_code in (200, 201), f"Failed to create subscription: {resp.text}"
        sub = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
        sub_id = sub["id"]

        try:
            # Call expire-trials cron
            cron_resp = requests.post(
                f"{app_url}/api/cron/expire-trials",
                headers=self._cron_headers(),
            )
            assert cron_resp.status_code == 200, (
                f"Cron endpoint failed: {cron_resp.status_code} {cron_resp.text}"
            )

            # Verify subscription is now expired
            check_resp = requests.get(
                f"{supabase_url}/rest/v1/subscriptions?id=eq.{sub_id}",
                headers=supabase_headers,
            )
            assert check_resp.status_code == 200, f"Query failed: {check_resp.text}"
            updated = check_resp.json()
            assert len(updated) == 1, "Subscription should still exist"
            assert updated[0]["status"] == "expired", (
                f"Expected status 'expired', got '{updated[0]['status']}'"
            )
        finally:
            # Cleanup
            requests.delete(
                f"{supabase_url}/rest/v1/subscriptions?id=eq.{sub_id}",
                headers={**supabase_headers, "Prefer": ""},
            )

    def test_active_not_expired(self, app_url, supabase_url, supabase_headers, test_tenant):
        """Insert subscription with trial_ends_at = next week, verify cron does not touch it."""
        assert CRON_SECRET, "CRON_SECRET not found in .env.local"
        tenant_id = test_tenant["tenant_id"]
        next_week = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

        # Insert future trial
        requests.delete(
            f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}",
            headers={**supabase_headers, "Prefer": ""},
        )
        resp = requests.post(
            f"{supabase_url}/rest/v1/subscriptions",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "status": "trial",
                "trial_ends_at": next_week,
                "plan_id": None,
            },
        )
        assert resp.status_code in (200, 201), f"Failed to create subscription: {resp.text}"
        sub = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
        sub_id = sub["id"]

        try:
            # Call expire-trials cron
            cron_resp = requests.post(
                f"{app_url}/api/cron/expire-trials",
                headers=self._cron_headers(),
            )
            assert cron_resp.status_code == 200, (
                f"Cron endpoint failed: {cron_resp.status_code} {cron_resp.text}"
            )

            # Verify subscription is still 'trial'
            check_resp = requests.get(
                f"{supabase_url}/rest/v1/subscriptions?id=eq.{sub_id}",
                headers=supabase_headers,
            )
            assert check_resp.status_code == 200, f"Query failed: {check_resp.text}"
            updated = check_resp.json()
            assert len(updated) == 1, "Subscription should still exist"
            assert updated[0]["status"] == "trial", (
                f"Expected status 'trial' (not expired), got '{updated[0]['status']}'"
            )
        finally:
            # Cleanup
            requests.delete(
                f"{supabase_url}/rest/v1/subscriptions?id=eq.{sub_id}",
                headers={**supabase_headers, "Prefer": ""},
            )
