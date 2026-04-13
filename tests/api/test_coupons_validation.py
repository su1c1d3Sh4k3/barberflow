"""
Tests for Zod validation on /api/coupons/generate endpoint.
"""
import requests
import pytest


class TestCouponsZodValidation:
    """Verify Zod schema enforcement on coupon generation."""

    def _headers(self, api_headers, test_tenant):
        return {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

    def test_requires_auth(self, app_url):
        """POST /api/coupons/generate without auth → 401."""
        resp = requests.post(
            f"{app_url}/api/coupons/generate",
            json={"discount_type": "percentage", "discount_value": 10},
        )
        assert resp.status_code == 401

    def test_rejects_missing_discount_value(self, app_url, api_headers, test_tenant):
        """Missing discount_value → 422."""
        resp = requests.post(
            f"{app_url}/api/coupons/generate",
            headers=self._headers(api_headers, test_tenant),
            json={"discount_type": "percentage"},
        )
        assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"

    def test_rejects_invalid_discount_type(self, app_url, api_headers, test_tenant):
        """Invalid discount_type → 422."""
        resp = requests.post(
            f"{app_url}/api/coupons/generate",
            headers=self._headers(api_headers, test_tenant),
            json={"discount_type": "BOGUS", "discount_value": 10},
        )
        assert resp.status_code == 422

    def test_rejects_negative_discount_value(self, app_url, api_headers, test_tenant):
        """Negative discount_value → 422."""
        resp = requests.post(
            f"{app_url}/api/coupons/generate",
            headers=self._headers(api_headers, test_tenant),
            json={"discount_type": "fixed", "discount_value": -5},
        )
        assert resp.status_code == 422

    def test_rejects_zero_discount_value(self, app_url, api_headers, test_tenant):
        """Zero discount_value → 422."""
        resp = requests.post(
            f"{app_url}/api/coupons/generate",
            headers=self._headers(api_headers, test_tenant),
            json={"discount_type": "fixed", "discount_value": 0},
        )
        assert resp.status_code == 422

    def test_accepts_valid_coupon(self, app_url, api_headers, test_tenant):
        """Valid payload → 201 with generated coupon."""
        resp = requests.post(
            f"{app_url}/api/coupons/generate",
            headers=self._headers(api_headers, test_tenant),
            json={"discount_type": "percentage", "discount_value": 15},
        )
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
        data = resp.json().get("data", {})
        assert data.get("discount_value") == 15
        assert data.get("active") is True
        assert data.get("code") is not None

    def test_accepts_custom_code(self, app_url, api_headers, test_tenant):
        """Custom code → should be uppercased."""
        import uuid
        custom = f"TEST{uuid.uuid4().hex[:6]}"
        resp = requests.post(
            f"{app_url}/api/coupons/generate",
            headers=self._headers(api_headers, test_tenant),
            json={"discount_type": "fixed", "discount_value": 20, "code": custom},
        )
        assert resp.status_code == 201
        assert resp.json()["data"]["code"] == custom.upper()

    def test_accepts_optional_fields(self, app_url, api_headers, test_tenant):
        """max_uses and expires_at are optional."""
        resp = requests.post(
            f"{app_url}/api/coupons/generate",
            headers=self._headers(api_headers, test_tenant),
            json={
                "discount_type": "percentage",
                "discount_value": 10,
                "max_uses": 100,
                "expires_at": "2026-12-31T23:59:59Z",
            },
        )
        assert resp.status_code == 201
        data = resp.json()["data"]
        assert data["max_uses"] == 100
