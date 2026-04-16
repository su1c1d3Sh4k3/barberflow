"""
Backend tests for whatsapp_sessions.service_active column.
Tests that the column exists, has correct default, and can be updated via REST.
"""
import pytest
import requests
import uuid


@pytest.fixture(scope="module")
def session_setup(supabase_headers, supabase_url, test_tenant):
    """Create a whatsapp_session for testing service_active."""
    tenant_id = test_tenant["tenant_id"]
    instance_id = f"sa-test-{uuid.uuid4().hex[:8]}"

    # Delete any existing session (UNIQUE tenant_id constraint)
    requests.delete(
        f"{supabase_url}/rest/v1/whatsapp_sessions?tenant_id=eq.{tenant_id}",
        headers={**supabase_headers, "Prefer": ""},
    )
    resp = requests.post(
        f"{supabase_url}/rest/v1/whatsapp_sessions",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "instance_id": instance_id,
            "instance_token": "sa-token-test",
            "status": "connected",
            "phone_number": "5511888880001",
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


class TestServiceActiveColumn:

    def test_column_exists_and_defaults_to_false(self, supabase_headers, supabase_url, session_setup):
        """service_active column should exist and default to false."""
        resp = requests.get(
            f"{supabase_url}/rest/v1/whatsapp_sessions"
            f"?id=eq.{session_setup['session_id']}&select=service_active",
            headers=supabase_headers,
        )
        assert resp.status_code == 200
        rows = resp.json()
        assert len(rows) == 1, "Expected exactly one session row"
        assert rows[0]["service_active"] is False, (
            f"Default service_active should be False, got {rows[0]['service_active']}"
        )

    def test_can_set_service_active_true(self, supabase_headers, supabase_url, session_setup):
        """Should be able to set service_active=true when session is connected."""
        resp = requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session_setup['session_id']}",
            headers=supabase_headers,
            json={"service_active": True},
        )
        assert resp.status_code in (200, 204), f"PATCH failed: {resp.text}"

        # Verify
        verify = requests.get(
            f"{supabase_url}/rest/v1/whatsapp_sessions"
            f"?id=eq.{session_setup['session_id']}&select=service_active",
            headers=supabase_headers,
        )
        assert verify.json()[0]["service_active"] is True

    def test_can_set_service_active_false(self, supabase_headers, supabase_url, session_setup):
        """Should be able to set service_active=false."""
        # First set to true
        requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session_setup['session_id']}",
            headers=supabase_headers,
            json={"service_active": True},
        )
        # Then set to false
        resp = requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session_setup['session_id']}",
            headers=supabase_headers,
            json={"service_active": False},
        )
        assert resp.status_code in (200, 204)

        verify = requests.get(
            f"{supabase_url}/rest/v1/whatsapp_sessions"
            f"?id=eq.{session_setup['session_id']}&select=service_active",
            headers=supabase_headers,
        )
        assert verify.json()[0]["service_active"] is False

    def test_service_active_resets_on_disconnect(self, supabase_headers, supabase_url, session_setup):
        """Trigger should reset service_active=false when status becomes disconnected."""
        # Activate service
        requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session_setup['session_id']}",
            headers=supabase_headers,
            json={"service_active": True},
        )
        # Verify active
        pre = requests.get(
            f"{supabase_url}/rest/v1/whatsapp_sessions"
            f"?id=eq.{session_setup['session_id']}&select=service_active",
            headers=supabase_headers,
        )
        assert pre.json()[0]["service_active"] is True

        # Simulate disconnect
        requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session_setup['session_id']}",
            headers=supabase_headers,
            json={"status": "disconnected"},
        )

        # Verify service_active was reset
        post = requests.get(
            f"{supabase_url}/rest/v1/whatsapp_sessions"
            f"?id=eq.{session_setup['session_id']}&select=service_active,status",
            headers=supabase_headers,
        )
        row = post.json()[0]
        assert row["status"] == "disconnected"
        assert row["service_active"] is False, (
            "service_active should be reset to False when session disconnects"
        )

    def test_service_active_resets_on_qr_pending(self, supabase_headers, supabase_url, session_setup):
        """service_active should reset to false when status becomes qr_pending."""
        # Set to connected + active first
        requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session_setup['session_id']}",
            headers=supabase_headers,
            json={"status": "connected", "service_active": True},
        )

        # Simulate QR regeneration
        requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session_setup['session_id']}",
            headers=supabase_headers,
            json={"status": "qr_pending"},
        )

        post = requests.get(
            f"{supabase_url}/rest/v1/whatsapp_sessions"
            f"?id=eq.{session_setup['session_id']}&select=service_active",
            headers=supabase_headers,
        )
        assert post.json()[0]["service_active"] is False

    def test_service_active_persists_when_still_connected(self, supabase_headers, supabase_url, session_setup):
        """service_active should NOT reset when a non-status field is updated."""
        # Set connected + active
        requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session_setup['session_id']}",
            headers=supabase_headers,
            json={"status": "connected", "service_active": True},
        )
        # Update unrelated field
        requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session_setup['session_id']}",
            headers=supabase_headers,
            json={"last_seen_at": "2026-04-15T12:00:00Z"},
        )

        post = requests.get(
            f"{supabase_url}/rest/v1/whatsapp_sessions"
            f"?id=eq.{session_setup['session_id']}&select=service_active",
            headers=supabase_headers,
        )
        assert post.json()[0]["service_active"] is True, (
            "service_active should remain True when status did not change"
        )
