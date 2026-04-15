"""
API tests for GET/PUT /api/whatsapp/service-active endpoint.
Tests authentication, validation, and business rules.
"""
import pytest
import requests
import uuid
import os


APP_URL = os.getenv("APP_URL", "http://localhost:3000")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


def api_headers(tenant_id: str) -> dict:
    """Headers for calling internal API routes (service role + tenant_id)."""
    return {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "x-tenant-id": tenant_id,
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="module")
def service_active_setup(supabase_headers, supabase_url, test_tenant):
    """Create a connected session for service-active API tests."""
    tenant_id = test_tenant["tenant_id"]
    instance_id = f"sa-api-{uuid.uuid4().hex[:8]}"

    # Create connected session
    resp = requests.post(
        f"{supabase_url}/rest/v1/whatsapp_sessions",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "instance_id": instance_id,
            "instance_token": "sa-api-token",
            "status": "connected",
            "phone_number": "5511777770099",
            "service_active": False,
        },
    )
    assert resp.status_code in (200, 201), f"Session creation failed: {resp.text}"
    session = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

    yield {"tenant_id": tenant_id, "session_id": session["id"]}

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


class TestServiceActiveEndpoint:

    def test_get_returns_401_without_auth(self):
        """GET without auth should return 401."""
        resp = requests.get(f"{APP_URL}/api/whatsapp/service-active")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}: {resp.text}"

    def test_put_returns_401_without_auth(self):
        """PUT without auth should return 401."""
        resp = requests.put(
            f"{APP_URL}/api/whatsapp/service-active",
            json={"service_active": True},
        )
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}: {resp.text}"

    def test_get_returns_session_data(self, service_active_setup):
        """GET with auth should return service_active and session_status."""
        tenant_id = service_active_setup["tenant_id"]
        resp = requests.get(
            f"{APP_URL}/api/whatsapp/service-active",
            headers=api_headers(tenant_id),
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body.get("success") is True
        data = body.get("data", {})
        assert "service_active" in data
        assert "session_status" in data
        assert "has_connected_session" in data
        assert isinstance(data["service_active"], bool)

    def test_put_returns_400_for_non_boolean(self, service_active_setup):
        """PUT with non-boolean service_active should return 400."""
        tenant_id = service_active_setup["tenant_id"]
        resp = requests.put(
            f"{APP_URL}/api/whatsapp/service-active",
            headers=api_headers(tenant_id),
            json={"service_active": "yes"},
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"

    def test_put_activates_service(self, supabase_url, supabase_headers, service_active_setup):
        """PUT with service_active=true on connected session should succeed."""
        tenant_id = service_active_setup["tenant_id"]
        session_id = service_active_setup["session_id"]

        # Ensure connected
        requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session_id}",
            headers=supabase_headers,
            json={"status": "connected", "service_active": False},
        )

        resp = requests.put(
            f"{APP_URL}/api/whatsapp/service-active",
            headers=api_headers(tenant_id),
            json={"service_active": True},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json().get("data", {})
        assert data.get("service_active") is True

        # Verify in DB
        verify = requests.get(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session_id}&select=service_active",
            headers=supabase_headers,
        )
        assert verify.json()[0]["service_active"] is True

    def test_put_deactivates_service(self, supabase_url, supabase_headers, service_active_setup):
        """PUT with service_active=false should always succeed."""
        tenant_id = service_active_setup["tenant_id"]
        session_id = service_active_setup["session_id"]

        resp = requests.put(
            f"{APP_URL}/api/whatsapp/service-active",
            headers=api_headers(tenant_id),
            json={"service_active": False},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

        verify = requests.get(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session_id}&select=service_active",
            headers=supabase_headers,
        )
        assert verify.json()[0]["service_active"] is False

    def test_put_returns_422_for_disconnected_session(self, supabase_url, supabase_headers, service_active_setup):
        """PUT service_active=true when session is disconnected should return 422."""
        tenant_id = service_active_setup["tenant_id"]
        session_id = service_active_setup["session_id"]

        # Temporarily set session to disconnected
        requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session_id}",
            headers=supabase_headers,
            json={"status": "disconnected", "service_active": False},
        )

        try:
            api_resp = requests.put(
                f"{APP_URL}/api/whatsapp/service-active",
                headers=api_headers(tenant_id),
                json={"service_active": True},
            )
            assert api_resp.status_code == 422, (
                f"Expected 422, got {api_resp.status_code}: {api_resp.text}"
            )
        finally:
            # Restore connected state
            requests.patch(
                f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session_id}",
                headers=supabase_headers,
                json={"status": "connected"},
            )
