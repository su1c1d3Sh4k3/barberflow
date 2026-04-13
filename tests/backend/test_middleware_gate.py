"""
Tests for subscription gate logic (DB state verification).
"""
import requests
import pytest
from datetime import datetime, timedelta, timezone


def _cleanup_subs(supabase_url, supabase_headers, tenant_id):
    """Remove any existing subscriptions for the tenant."""
    requests.delete(
        f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}",
        headers={**supabase_headers, "Prefer": ""},
    )


def _ts(dt):
    """Format datetime as ISO string without +00:00 (use Z instead)."""
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


class TestMiddlewareGate:
    """Verify subscription states can be detected via DB queries."""

    def test_trial_subscription_created(self, supabase_url, supabase_headers, test_tenant):
        """Verify test_tenant can have a trial subscription with trial_ends_at."""
        tenant_id = test_tenant["tenant_id"]
        _cleanup_subs(supabase_url, supabase_headers, tenant_id)

        trial_end = _ts(datetime.now(timezone.utc) + timedelta(days=14))

        resp = requests.post(
            f"{supabase_url}/rest/v1/subscriptions",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "status": "trial", "trial_ends_at": trial_end},
        )
        assert resp.status_code in (200, 201), f"Failed: {resp.text}"
        sub = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
        assert sub["status"] == "trial"
        assert sub["trial_ends_at"] is not None

        _cleanup_subs(supabase_url, supabase_headers, tenant_id)

    def test_expired_trial_detectable(self, supabase_url, supabase_headers, test_tenant):
        """Create subscription with past trial_ends_at, verify it's queryable."""
        tenant_id = test_tenant["tenant_id"]
        _cleanup_subs(supabase_url, supabase_headers, tenant_id)

        past = _ts(datetime.now(timezone.utc) - timedelta(days=1))

        resp = requests.post(
            f"{supabase_url}/rest/v1/subscriptions",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "status": "trial", "trial_ends_at": past},
        )
        assert resp.status_code in (200, 201), f"Failed: {resp.text}"
        sub = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

        # Query for expired trials
        now = _ts(datetime.now(timezone.utc))
        query_resp = requests.get(
            f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}&status=eq.trial&trial_ends_at=lt.{now}",
            headers=supabase_headers,
        )
        assert query_resp.status_code == 200, f"Query failed: {query_resp.text}"
        expired = query_resp.json()
        assert len(expired) >= 1, "Should find expired trial"
        assert expired[0]["id"] == sub["id"]

        _cleanup_subs(supabase_url, supabase_headers, tenant_id)

    def test_active_subscription_detectable(self, supabase_url, supabase_headers, test_tenant):
        """Create active subscription with future period end."""
        tenant_id = test_tenant["tenant_id"]
        _cleanup_subs(supabase_url, supabase_headers, tenant_id)

        future = _ts(datetime.now(timezone.utc) + timedelta(days=30))

        resp = requests.post(
            f"{supabase_url}/rest/v1/subscriptions",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "status": "active", "current_period_end": future},
        )
        assert resp.status_code in (200, 201), f"Failed: {resp.text}"
        sub = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
        assert sub["status"] == "active"
        assert sub["current_period_end"] is not None

        _cleanup_subs(supabase_url, supabase_headers, tenant_id)
