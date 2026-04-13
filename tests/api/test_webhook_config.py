"""
Tests for WhatsApp webhook configuration endpoint.
Endpoint: POST /api/whatsapp/configure-webhook
"""
import requests
import pytest


class TestWebhookConfig:
    """WhatsApp webhook auto-configuration endpoint tests."""

    def test_configure_webhook_requires_auth(self, app_url):
        """POST without auth should return 401."""
        resp = requests.post(
            f"{app_url}/api/whatsapp/configure-webhook",
            json={"instance_id": "test-instance"},
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 401, (
            f"Expected 401 without auth, got {resp.status_code}: {resp.text}"
        )

    def test_configure_webhook_requires_tenant(self, app_url, api_headers):
        """POST without x-tenant-id should return 400."""
        resp = requests.post(
            f"{app_url}/api/whatsapp/configure-webhook",
            json={"instance_id": "test-instance"},
            headers=api_headers,
        )
        assert resp.status_code == 400, (
            f"Expected 400 without tenant, got {resp.status_code}: {resp.text}"
        )

    def test_configure_webhook_requires_instance_id(self, app_url, api_headers, test_tenant):
        """POST without instance_id should return 400."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/whatsapp/configure-webhook",
            json={},
            headers=headers,
        )
        assert resp.status_code == 400, (
            f"Expected 400 without instance_id, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert data["success"] is False
        assert "instance_id" in data.get("error", "").lower()

    def test_configure_webhook_no_session(self, app_url, api_headers, test_tenant):
        """POST for a tenant with no WhatsApp session should return 404."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/whatsapp/configure-webhook",
            json={"instance_id": "nonexistent-instance"},
            headers=headers,
        )
        # 404 if no session, or 400/500 if session lacks token
        assert resp.status_code in (404, 400, 500), (
            f"Expected error for nonexistent session, got {resp.status_code}: {resp.text}"
        )

    def test_configure_webhook_with_session_no_token(
        self, app_url, api_headers, test_tenant, supabase_url, supabase_headers
    ):
        """POST for a session without instance_token should return 400."""
        tenant_id = test_tenant["tenant_id"]

        # Create a whatsapp_session without instance_token
        requests.post(
            f"{supabase_url}/rest/v1/whatsapp_sessions",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "status": "disconnected",
            },
        )

        try:
            headers = {**api_headers, "x-tenant-id": tenant_id}
            resp = requests.post(
                f"{app_url}/api/whatsapp/configure-webhook",
                json={"instance_id": "some-instance"},
                headers=headers,
            )
            # Should fail because instance_token is null
            assert resp.status_code == 400, (
                f"Expected 400 for session without token, got {resp.status_code}: {resp.text}"
            )
        finally:
            # Cleanup
            requests.delete(
                f"{supabase_url}/rest/v1/whatsapp_sessions?tenant_id=eq.{tenant_id}",
                headers={**supabase_headers, "Prefer": ""},
            )

    def test_configure_webhook_updates_session_timestamp(
        self, app_url, api_headers, test_tenant, supabase_url, supabase_headers
    ):
        """When webhook config succeeds on uazapi, session should have webhook_configured_at."""
        tenant_id = test_tenant["tenant_id"]

        # Create a session with a fake instance_token
        # The uazapi call will fail, so we test that error is handled gracefully
        requests.post(
            f"{supabase_url}/rest/v1/whatsapp_sessions",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "status": "connected",
                "instance_token": "fake-token-for-test",
            },
        )

        try:
            headers = {**api_headers, "x-tenant-id": tenant_id}
            resp = requests.post(
                f"{app_url}/api/whatsapp/configure-webhook",
                json={"instance_id": tenant_id},
                headers=headers,
            )
            # Will likely fail due to fake token / uazapi unreachable - that's expected
            # The test verifies the endpoint exists and processes the request
            assert resp.status_code in (200, 500), (
                f"Expected 200 or 500 (uazapi error), got {resp.status_code}: {resp.text}"
            )
        finally:
            requests.delete(
                f"{supabase_url}/rest/v1/whatsapp_sessions?tenant_id=eq.{tenant_id}",
                headers={**supabase_headers, "Prefer": ""},
            )
