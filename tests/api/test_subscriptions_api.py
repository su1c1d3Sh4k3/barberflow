"""
Tests for subscription API routes.
"""
import requests
import pytest


class TestSubscriptionsAPI:
    """Subscription management endpoints."""

    def test_create_subscription_requires_auth(self, app_url):
        """POST /api/subscriptions/create without auth should return 401."""
        resp = requests.post(
            f"{app_url}/api/subscriptions/create",
            headers={"Content-Type": "application/json"},
            json={"plan_id": "fake", "payment_method": "PIX",
                  "customer_name": "Test", "customer_email": "t@t.com"},
        )
        assert resp.status_code == 401, (
            f"Expected 401 without auth, got {resp.status_code}: {resp.text}"
        )

    def test_subscription_status_requires_auth(self, app_url):
        """GET /api/subscriptions/status without auth should return 401."""
        resp = requests.get(
            f"{app_url}/api/subscriptions/status",
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 401, (
            f"Expected 401 without auth, got {resp.status_code}: {resp.text}"
        )

    def test_cancel_subscription_requires_auth(self, app_url):
        """POST /api/subscriptions/cancel without auth should return 401."""
        resp = requests.post(
            f"{app_url}/api/subscriptions/cancel",
            headers={"Content-Type": "application/json"},
            json={},
        )
        assert resp.status_code == 401, (
            f"Expected 401 without auth, got {resp.status_code}: {resp.text}"
        )

    def test_subscription_status_with_auth(self, app_url, api_headers, test_tenant):
        """GET /api/subscriptions/status with proper headers should return 200 or 404."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(
            f"{app_url}/api/subscriptions/status",
            headers=headers,
        )
        # 200 if subscription exists, 404 if none - both are valid
        assert resp.status_code in (200, 404), (
            f"Expected 200 or 404 with auth, got {resp.status_code}: {resp.text}"
        )

    def test_cancel_nonexistent(self, app_url, api_headers, test_tenant):
        """POST /api/subscriptions/cancel for tenant with no subscription should error."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/subscriptions/cancel",
            headers=headers,
            json={"reason": "testing"},
        )
        # Should return 404 (no subscription found) or 400
        assert resp.status_code in (400, 404), (
            f"Expected 400 or 404 for nonexistent subscription, got {resp.status_code}: {resp.text}"
        )
