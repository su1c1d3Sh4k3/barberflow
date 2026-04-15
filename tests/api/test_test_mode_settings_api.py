"""
API tests for GET/PUT /api/settings/test-mode endpoint.
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
def test_mode_setup(supabase_headers, supabase_url, test_tenant):
    """Ensure settings row and connected session exist for test-mode API tests."""
    tenant_id = test_tenant["tenant_id"]

    # Ensure settings row
    requests.post(
        f"{supabase_url}/rest/v1/settings",
        headers={**supabase_headers, "Prefer": "resolution=ignore-duplicates"},
        json={"tenant_id": tenant_id, "test_mode": False, "test_numbers": []},
    )

    # Create a connected session
    instance_id = f"tm-api-{uuid.uuid4().hex[:8]}"
    resp = requests.post(
        f"{supabase_url}/rest/v1/whatsapp_sessions",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "instance_id": instance_id,
            "instance_token": "tm-api-token",
            "status": "connected",
            "phone_number": "5511666660099",
        },
    )
    assert resp.status_code in (200, 201), f"Session creation failed: {resp.text}"
    session = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

    yield {"tenant_id": tenant_id, "session_id": session["id"]}

    # Cleanup session
    requests.delete(
        f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
    # Reset settings
    requests.patch(
        f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}",
        headers=supabase_headers,
        json={"test_mode": False, "test_numbers": []},
    )


class TestTestModeEndpoint:

    def test_get_returns_401_without_auth(self):
        """GET without auth should return 401."""
        resp = requests.get(f"{APP_URL}/api/settings/test-mode")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}: {resp.text}"

    def test_put_returns_401_without_auth(self):
        """PUT without auth should return 401."""
        resp = requests.put(
            f"{APP_URL}/api/settings/test-mode",
            json={"test_mode": True},
        )
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}: {resp.text}"

    def test_get_returns_test_mode_data(self, test_mode_setup):
        """GET with auth should return test_mode, test_numbers, has_connected_session."""
        tenant_id = test_mode_setup["tenant_id"]
        resp = requests.get(
            f"{APP_URL}/api/settings/test-mode",
            headers=api_headers(tenant_id),
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body.get("success") is True
        data = body.get("data", {})
        assert "test_mode" in data
        assert "test_numbers" in data
        assert "has_connected_session" in data
        assert isinstance(data["test_mode"], bool)
        assert isinstance(data["test_numbers"], list)

    def test_put_returns_400_for_non_boolean_test_mode(self, test_mode_setup):
        """PUT with non-boolean test_mode should return 400."""
        tenant_id = test_mode_setup["tenant_id"]
        resp = requests.put(
            f"{APP_URL}/api/settings/test-mode",
            headers=api_headers(tenant_id),
            json={"test_mode": "on"},
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"

    def test_put_returns_400_for_non_array_test_numbers(self, test_mode_setup):
        """PUT with non-array test_numbers should return 400."""
        tenant_id = test_mode_setup["tenant_id"]
        resp = requests.put(
            f"{APP_URL}/api/settings/test-mode",
            headers=api_headers(tenant_id),
            json={"test_numbers": "5511999990001"},
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"

    def test_put_updates_test_numbers(self, supabase_url, supabase_headers, test_mode_setup):
        """PUT should update test_numbers successfully."""
        tenant_id = test_mode_setup["tenant_id"]
        numbers = ["5511111110001", "5511222220002"]

        resp = requests.put(
            f"{APP_URL}/api/settings/test-mode",
            headers=api_headers(tenant_id),
            json={"test_numbers": numbers},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json().get("data", {})
        assert set(data.get("test_numbers", [])) == set(numbers)

    def test_put_enables_test_mode_with_connected_session(self, supabase_url, supabase_headers, test_mode_setup):
        """PUT test_mode=true should succeed when session is connected."""
        tenant_id = test_mode_setup["tenant_id"]
        session_id = test_mode_setup["session_id"]

        # Ensure session is connected
        requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session_id}",
            headers=supabase_headers,
            json={"status": "connected"},
        )

        resp = requests.put(
            f"{APP_URL}/api/settings/test-mode",
            headers=api_headers(tenant_id),
            json={"test_mode": True, "test_numbers": ["5511999990001"]},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json().get("data", {})
        assert data.get("test_mode") is True

        # Verify in DB
        verify = requests.get(
            f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}&select=test_mode",
            headers=supabase_headers,
        )
        assert verify.json()[0]["test_mode"] is True

    def test_put_disables_test_mode(self, supabase_url, supabase_headers, test_mode_setup):
        """PUT test_mode=false should always succeed."""
        tenant_id = test_mode_setup["tenant_id"]

        resp = requests.put(
            f"{APP_URL}/api/settings/test-mode",
            headers=api_headers(tenant_id),
            json={"test_mode": False},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json().get("data", {})
        assert data.get("test_mode") is False

    def test_put_returns_422_when_enabling_without_session(self, supabase_url, supabase_headers, test_mode_setup):
        """PUT test_mode=true should return 422 when no connected WhatsApp session."""
        tenant_id = test_mode_setup["tenant_id"]
        session_id = test_mode_setup["session_id"]

        # Temporarily set session to disconnected
        requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session_id}",
            headers=supabase_headers,
            json={"status": "disconnected"},
        )

        try:
            api_resp = requests.put(
                f"{APP_URL}/api/settings/test-mode",
                headers=api_headers(tenant_id),
                json={"test_mode": True},
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

    def test_put_sanitizes_test_numbers(self, test_mode_setup):
        """PUT should trim and filter empty strings from test_numbers."""
        tenant_id = test_mode_setup["tenant_id"]

        resp = requests.put(
            f"{APP_URL}/api/settings/test-mode",
            headers=api_headers(tenant_id),
            json={"test_numbers": ["  5511111110001  ", "", "5511222220002", "   "]},
        )
        assert resp.status_code == 200
        data = resp.json().get("data", {})
        numbers = data.get("test_numbers", [])
        assert "" not in numbers, "Empty strings should be filtered out"
        assert "5511111110001" in numbers
        assert "5511222220002" in numbers
