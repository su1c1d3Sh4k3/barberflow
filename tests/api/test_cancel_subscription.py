"""
Tests for subscription cancellation API endpoint.
"""
import requests
import pytest


class TestCancelSubscription:
    """Tests for POST /api/subscriptions/cancel."""

    def test_cancel_requires_auth(self, app_url):
        """POST /api/subscriptions/cancel without auth should return 401."""
        resp = requests.post(
            f"{app_url}/api/subscriptions/cancel",
            headers={"Content-Type": "application/json"},
            json={"reason": "testing"},
        )
        assert resp.status_code == 401, (
            f"Expected 401 without auth, got {resp.status_code}: {resp.text}"
        )

    def test_cancel_requires_tenant_id(self, app_url, api_headers):
        """POST /api/subscriptions/cancel without x-tenant-id should return 400."""
        resp = requests.post(
            f"{app_url}/api/subscriptions/cancel",
            headers=api_headers,
            json={"reason": "testing"},
        )
        assert resp.status_code == 400, (
            f"Expected 400 without tenant id, got {resp.status_code}: {resp.text}"
        )

    def test_cancel_nonexistent_subscription(self, app_url, api_headers, test_tenant):
        """POST /api/subscriptions/cancel for tenant with no subscription returns 404."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/subscriptions/cancel",
            headers=headers,
            json={"reason": "testing cancellation"},
        )
        # 404 = no subscription found for this tenant
        assert resp.status_code in (400, 404), (
            f"Expected 400 or 404 for nonexistent subscription, got {resp.status_code}: {resp.text}"
        )
        body = resp.json()
        assert body.get("success") is False, "Expected success=false"

    def test_cancel_with_reason(self, app_url, api_headers, test_tenant, supabase_url, supabase_headers):
        """POST /api/subscriptions/cancel with valid subscription and reason should succeed."""
        tenant_id = test_tenant["tenant_id"]

        # First, create a subscription record directly in DB
        sub_resp = requests.post(
            f"{supabase_url}/rest/v1/subscriptions",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "plan_id": "essencial_monthly",
                "status": "active",
                "payment_method": "PIX",
                "current_period_start": "2026-04-01T00:00:00Z",
                "current_period_end": "2026-05-01T00:00:00Z",
            },
        )
        assert sub_resp.status_code in (200, 201, 409), (
            f"Failed to create test subscription: {sub_resp.text}"
        )

        # If 409 (conflict/already exists), update the existing one to active
        if sub_resp.status_code == 409:
            requests.patch(
                f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}",
                headers=supabase_headers,
                json={"status": "active", "canceled_at": None},
            )

        # Now cancel it
        headers = {**api_headers, "x-tenant-id": tenant_id}
        resp = requests.post(
            f"{app_url}/api/subscriptions/cancel",
            headers=headers,
            json={"reason": "Muito caro para mim"},
        )
        assert resp.status_code == 200, (
            f"Expected 200 for valid cancellation, got {resp.status_code}: {resp.text}"
        )
        body = resp.json()
        assert body.get("success") is True, "Expected success=true"
        assert "canceled_at" in body.get("data", {}), "Expected canceled_at in response"

        # Verify the subscription status in DB
        check = requests.get(
            f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}&select=status,cancellation_reason",
            headers=supabase_headers,
        )
        if check.status_code == 200 and check.json():
            sub_data = check.json()[0]
            assert sub_data["status"] == "canceled", "Subscription should be canceled"
            assert sub_data["cancellation_reason"] == "Muito caro para mim", (
                "Cancellation reason should be stored"
            )

    def test_cancel_already_canceled(self, app_url, api_headers, test_tenant, supabase_url, supabase_headers):
        """POST /api/subscriptions/cancel on already canceled subscription returns error."""
        tenant_id = test_tenant["tenant_id"]

        # Ensure subscription exists and is canceled
        requests.patch(
            f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}",
            headers=supabase_headers,
            json={"status": "canceled"},
        )

        headers = {**api_headers, "x-tenant-id": tenant_id}
        resp = requests.post(
            f"{app_url}/api/subscriptions/cancel",
            headers=headers,
            json={"reason": "double cancel attempt"},
        )
        assert resp.status_code == 400, (
            f"Expected 400 for already canceled, got {resp.status_code}: {resp.text}"
        )
        body = resp.json()
        assert body.get("success") is False, "Expected success=false for already canceled"

    def test_cancel_without_reason(self, app_url, api_headers, test_tenant, supabase_url, supabase_headers):
        """POST /api/subscriptions/cancel without reason should still succeed."""
        tenant_id = test_tenant["tenant_id"]

        # Reset subscription to active
        requests.patch(
            f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}",
            headers=supabase_headers,
            json={"status": "active", "canceled_at": None, "cancellation_reason": None},
        )

        headers = {**api_headers, "x-tenant-id": tenant_id}
        resp = requests.post(
            f"{app_url}/api/subscriptions/cancel",
            headers=headers,
            json={},
        )
        assert resp.status_code == 200, (
            f"Expected 200 for cancel without reason, got {resp.status_code}: {resp.text}"
        )
        body = resp.json()
        assert body.get("success") is True, "Expected success=true"
