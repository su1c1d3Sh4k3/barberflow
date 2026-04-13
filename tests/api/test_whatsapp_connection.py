"""
Test WhatsApp connection flow:
1. Create instance with name + phone
2. Get pairing code back
3. Check status polling
"""
import pytest
import requests

APP_URL = "http://localhost:3000"


class TestWhatsAppCreateInstance:
    """Test /api/whatsapp/create-instance endpoint."""

    def test_create_instance_requires_auth(self, app_url):
        """Without cookies or service-role, should return 401."""
        resp = requests.post(
            f"{app_url}/api/whatsapp/create-instance",
            json={"instance_name": "test", "phone": "5511999999999"},
        )
        assert resp.status_code == 401

    def test_create_instance_missing_name(self, app_url, api_headers, test_tenant):
        """Should reject if instance_name is missing."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/whatsapp/create-instance",
            headers=headers,
            json={"phone": "5511999999999"},
        )
        data = resp.json()
        assert data["success"] is False
        assert "nome" in data["error"].lower() or resp.status_code == 422

    def test_create_instance_missing_phone(self, app_url, api_headers, test_tenant):
        """Should reject if phone is missing."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/whatsapp/create-instance",
            headers=headers,
            json={"instance_name": "test-instance"},
        )
        data = resp.json()
        assert data["success"] is False
        assert "telefone" in data["error"].lower() or resp.status_code == 422

    def test_create_instance_success(self, app_url, api_headers, test_tenant, supabase_url, supabase_headers):
        """Should create instance and return pairing code."""
        tenant_id = test_tenant["tenant_id"]
        headers = {**api_headers, "x-tenant-id": tenant_id}
        resp = requests.post(
            f"{app_url}/api/whatsapp/create-instance",
            headers=headers,
            json={"instance_name": f"barberflow-pytest-{tenant_id[:8]}", "phone": "5511999990000"},
            timeout=30,
        )
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        assert data["success"] is True, f"Response: {data}"
        assert data["data"]["instance_id"] is not None
        assert data["data"]["status"] == "connecting"
        assert data["data"]["pair_code"] is not None, "Pairing code should be returned"

        # Verify session was saved in DB
        import time
        time.sleep(1)
        r = requests.get(
            f"{supabase_url}/rest/v1/whatsapp_sessions?tenant_id=eq.{tenant_id}&select=*",
            headers=supabase_headers,
        )
        sessions = r.json()
        assert len(sessions) >= 1, f"No session found for tenant {tenant_id}"
        assert sessions[0]["status"] == "connecting"
        assert sessions[0]["instance_token"] is not None
        assert sessions[0]["phone_number"] is not None

        # Cleanup: delete session from DB
        requests.delete(
            f"{supabase_url}/rest/v1/whatsapp_sessions?tenant_id=eq.{tenant_id}",
            headers={**supabase_headers, "Prefer": ""},
        )


class TestWhatsAppStatus:
    """Test /api/whatsapp/status endpoint."""

    def test_status_no_session(self, app_url, api_headers, test_tenant):
        """Should return disconnected when no session exists."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/whatsapp/status", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["data"]["status"] == "disconnected"
