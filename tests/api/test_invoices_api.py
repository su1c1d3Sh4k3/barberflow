"""
Tests for /api/subscriptions/invoices endpoint.
"""
import requests
import pytest


class TestInvoicesAPI:
    """Verify invoice listing endpoint."""

    def test_invoices_requires_auth(self, app_url):
        """GET /api/subscriptions/invoices without auth should return 401."""
        resp = requests.get(f"{app_url}/api/subscriptions/invoices")
        assert resp.status_code == 401

    def test_invoices_with_auth(self, app_url, api_headers, test_tenant):
        """GET /api/subscriptions/invoices with auth should return 200."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/subscriptions/invoices", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert isinstance(body.get("data"), list)

    def test_invoices_pagination(self, app_url, api_headers, test_tenant):
        """GET /api/subscriptions/invoices with limit/offset should work."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(
            f"{app_url}/api/subscriptions/invoices?limit=5&offset=0",
            headers=headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        data = body.get("data", [])
        assert len(data) <= 5

    def test_invoices_with_data(self, app_url, api_headers, test_tenant, supabase_headers, supabase_url):
        """After creating an invoice, it should appear in the list."""
        tenant_id = test_tenant["tenant_id"]

        # Create a test invoice directly in DB
        inv_resp = requests.post(
            f"{supabase_url}/rest/v1/invoices",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "type": "subscription",
                "description": "Test Invoice",
                "value": 99.90,
                "status": "PENDING",
                "billing_type": "PIX",
                "due_date": "2026-05-01",
            },
        )
        assert inv_resp.status_code in (200, 201), f"Invoice creation failed: {inv_resp.text}"

        # Fetch via API
        headers = {**api_headers, "x-tenant-id": tenant_id}
        resp = requests.get(f"{app_url}/api/subscriptions/invoices", headers=headers)
        assert resp.status_code == 200
        invoices = resp.json().get("data", [])
        assert len(invoices) >= 1, "Should return at least 1 invoice"

        # Verify invoice fields
        inv = invoices[0]
        assert "id" in inv
        assert "value" in inv
        assert "status" in inv
        assert "due_date" in inv
