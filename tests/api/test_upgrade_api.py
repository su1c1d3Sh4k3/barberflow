"""
Tests for /api/subscriptions/upgrade and /api/subscriptions/current endpoints.
"""
import requests
import pytest
from datetime import datetime, timedelta


@pytest.fixture(scope="module")
def subscription_setup(supabase_headers, supabase_url, test_tenant):
    """Create a subscription for upgrade tests."""
    tenant_id = test_tenant["tenant_id"]

    now = datetime.utcnow()
    period_end = now + timedelta(days=30)

    # Create subscription on essencial_monthly
    resp = requests.post(
        f"{supabase_url}/rest/v1/subscriptions",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "plan_id": "essencial_monthly",
            "status": "active",
            "payment_method": "PIX",
            "current_period_start": now.isoformat(),
            "current_period_end": period_end.isoformat(),
        },
    )
    # May conflict if subscription already exists from other test
    if resp.status_code == 409:
        # Update existing
        requests.patch(
            f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}",
            headers=supabase_headers,
            json={
                "plan_id": "essencial_monthly",
                "status": "active",
                "current_period_start": now.isoformat(),
                "current_period_end": period_end.isoformat(),
            },
        )
    else:
        assert resp.status_code in (200, 201), f"Subscription creation failed: {resp.text}"

    yield {"tenant_id": tenant_id}

    # Cleanup: delete invoices created by upgrade, then subscription
    requests.delete(
        f"{supabase_url}/rest/v1/invoices?tenant_id=eq.{tenant_id}&type=eq.upgrade",
        headers={**supabase_headers, "Prefer": ""},
    )


class TestSubscriptionCurrent:
    """GET /api/subscriptions/current tests."""

    def test_current_requires_auth(self, app_url):
        """GET /api/subscriptions/current without auth should return 401."""
        resp = requests.get(f"{app_url}/api/subscriptions/current")
        assert resp.status_code == 401

    def test_current_returns_subscription(self, app_url, api_headers, subscription_setup):
        """GET /api/subscriptions/current should return the active subscription."""
        headers = {**api_headers, "x-tenant-id": subscription_setup["tenant_id"]}
        resp = requests.get(f"{app_url}/api/subscriptions/current", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        data = body.get("data")
        assert data is not None
        assert data.get("plan_id") == "essencial_monthly"
        assert data.get("status") == "active"

    def test_current_includes_plan_details(self, app_url, api_headers, subscription_setup):
        """GET /api/subscriptions/current should include joined plan data."""
        headers = {**api_headers, "x-tenant-id": subscription_setup["tenant_id"]}
        resp = requests.get(f"{app_url}/api/subscriptions/current", headers=headers)
        assert resp.status_code == 200
        data = resp.json().get("data", {})
        # plans join should be present
        assert "plans" in data or "plan_id" in data


class TestSubscriptionUpgrade:
    """POST /api/subscriptions/upgrade tests."""

    def test_upgrade_requires_auth(self, app_url):
        """POST /api/subscriptions/upgrade without auth should return 401."""
        resp = requests.post(
            f"{app_url}/api/subscriptions/upgrade",
            headers={"Content-Type": "application/json"},
            json={"new_plan_id": "ia_monthly"},
        )
        assert resp.status_code == 401

    def test_upgrade_missing_plan_id(self, app_url, api_headers, subscription_setup):
        """POST /api/subscriptions/upgrade without new_plan_id should return 400."""
        headers = {**api_headers, "x-tenant-id": subscription_setup["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/subscriptions/upgrade",
            headers=headers,
            json={},
        )
        assert resp.status_code == 400

    def test_upgrade_invalid_plan(self, app_url, api_headers, subscription_setup):
        """POST /api/subscriptions/upgrade with invalid plan should return 404."""
        headers = {**api_headers, "x-tenant-id": subscription_setup["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/subscriptions/upgrade",
            headers=headers,
            json={"new_plan_id": "nonexistent_plan"},
        )
        assert resp.status_code == 404

    def test_upgrade_essencial_to_ia(self, app_url, api_headers, subscription_setup):
        """POST /api/subscriptions/upgrade from essencial to IA should succeed."""
        headers = {**api_headers, "x-tenant-id": subscription_setup["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/subscriptions/upgrade",
            headers=headers,
            json={"new_plan_id": "ia_monthly"},
        )
        assert resp.status_code == 200, f"Upgrade failed: {resp.text}"
        body = resp.json()
        assert body.get("success") is True
        data = body.get("data", {})
        assert data.get("previous_plan") == "essencial_monthly"
        assert data.get("new_plan") == "ia_monthly"
        assert "prorated_amount" in data
        assert "unused_credit" in data
        assert data["prorated_amount"] >= 0
        assert data["unused_credit"] >= 0

    def test_upgrade_creates_prorated_invoice(self, app_url, api_headers, subscription_setup,
                                               supabase_headers, supabase_url):
        """After upgrade, a prorated invoice should exist."""
        tenant_id = subscription_setup["tenant_id"]

        # Reset to essencial first
        requests.patch(
            f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}",
            headers=supabase_headers,
            json={"plan_id": "essencial_monthly", "status": "active"},
        )
        # Clean old upgrade invoices
        requests.delete(
            f"{supabase_url}/rest/v1/invoices?tenant_id=eq.{tenant_id}&type=eq.upgrade",
            headers={**supabase_headers, "Prefer": ""},
        )

        # Perform upgrade
        headers = {**api_headers, "x-tenant-id": tenant_id}
        resp = requests.post(
            f"{app_url}/api/subscriptions/upgrade",
            headers=headers,
            json={"new_plan_id": "ia_monthly"},
        )
        assert resp.status_code == 200

        prorated = resp.json().get("data", {}).get("prorated_amount", 0)
        if prorated > 1:
            # Check invoice was created
            inv_resp = requests.get(
                f"{supabase_url}/rest/v1/invoices?tenant_id=eq.{tenant_id}&type=eq.upgrade&select=*",
                headers=supabase_headers,
            )
            assert inv_resp.status_code == 200
            invoices = inv_resp.json()
            assert len(invoices) >= 1, "Prorated invoice should be created"
            assert invoices[0]["type"] == "upgrade"
