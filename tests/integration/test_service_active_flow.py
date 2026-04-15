"""
Integration tests: Full flow of service_active and test_mode.
Tests the complete lifecycle: session creation → activation → webhook processing → deactivation.
"""
import pytest
import requests
import uuid
import os
import time


APP_URL = os.getenv("APP_URL", "http://localhost:3000")
WEBHOOK_TOKEN = os.getenv("WHATSAPP_WEBHOOK_TOKEN", "")


def send_webhook(instance_id: str, phone: str, message: str) -> requests.Response:
    url = f"{APP_URL}/api/webhooks/whatsapp"
    if WEBHOOK_TOKEN:
        url += f"?token={WEBHOOK_TOKEN}"
    payload = {
        "event": "messages",
        "instance": {"id": instance_id},
        "data": {
            "key": {
                "remoteJid": f"{phone}@s.whatsapp.net",
                "fromMe": False,
                "id": f"MSG{uuid.uuid4().hex[:12].upper()}",
            },
            "message": {"conversation": message},
            "pushName": "Integration Test User",
        },
    }
    return requests.post(url, json=payload, timeout=15)


@pytest.fixture(scope="module")
def integration_setup(supabase_headers, supabase_url, test_tenant):
    """Full setup: tenant with session, settings, category, service, professional."""
    tenant_id = test_tenant["tenant_id"]
    company_id = test_tenant["company_id"]
    instance_id = f"int-{uuid.uuid4().hex[:8]}"

    # Create connected session (service_active=false initially)
    resp = requests.post(
        f"{supabase_url}/rest/v1/whatsapp_sessions",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "instance_id": instance_id,
            "instance_token": "int-token",
            "status": "connected",
            "phone_number": "5511333330001",
            "service_active": False,
        },
    )
    assert resp.status_code in (200, 201), f"Session creation failed: {resp.text}"
    session = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

    # Ensure settings row with test_mode=false
    requests.post(
        f"{supabase_url}/rest/v1/settings",
        headers={**supabase_headers, "Prefer": "resolution=ignore-duplicates"},
        json={"tenant_id": tenant_id, "test_mode": False, "test_numbers": []},
    )
    requests.patch(
        f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}",
        headers=supabase_headers,
        json={"test_mode": False, "test_numbers": []},
    )

    yield {
        "tenant_id": tenant_id,
        "company_id": company_id,
        "session_id": session["id"],
        "instance_id": instance_id,
    }

    # Full cleanup
    requests.patch(
        f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}",
        headers=supabase_headers,
        json={"test_mode": False, "test_numbers": []},
    )
    requests.delete(
        f"{supabase_url}/rest/v1/conversation_states?tenant_id=eq.{tenant_id}",
        headers={**supabase_headers, "Prefer": ""},
    )
    requests.delete(
        f"{supabase_url}/rest/v1/messages?tenant_id=eq.{tenant_id}",
        headers={**supabase_headers, "Prefer": ""},
    )
    requests.delete(
        f"{supabase_url}/rest/v1/contacts?tenant_id=eq.{tenant_id}",
        headers={**supabase_headers, "Prefer": ""},
    )
    requests.delete(
        f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


class TestServiceActiveFullFlow:

    def test_01_webhook_skipped_before_activation(self, supabase_url, supabase_headers, integration_setup):
        """Step 1: With service_active=false, webhook should be skipped."""
        setup = integration_setup
        phone = f"5511{uuid.uuid4().hex[:9]}"

        # Ensure service is inactive
        requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{setup['session_id']}",
            headers=supabase_headers,
            json={"service_active": False},
        )

        resp = send_webhook(setup["instance_id"], phone, "oi")
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("skipped") is True
        assert body.get("reason") == "service_inactive"

    def test_02_activate_service(self, supabase_url, supabase_headers, integration_setup):
        """Step 2: Activate service_active=true."""
        setup = integration_setup
        resp = requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{setup['session_id']}",
            headers=supabase_headers,
            json={"service_active": True},
        )
        assert resp.status_code in (200, 204)

        # Verify
        verify = requests.get(
            f"{supabase_url}/rest/v1/whatsapp_sessions"
            f"?id=eq.{setup['session_id']}&select=service_active",
            headers=supabase_headers,
        )
        assert verify.json()[0]["service_active"] is True

    def test_03_webhook_processed_after_activation(self, supabase_url, supabase_headers, integration_setup):
        """Step 3: With service_active=true, webhook should trigger bot."""
        setup = integration_setup
        phone = f"5511{uuid.uuid4().hex[:9]}"
        tenant_id = setup["tenant_id"]

        resp = send_webhook(setup["instance_id"], phone, "oi")
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert body.get("reason") != "service_inactive", (
            "Webhook should not be skipped when service_active=true"
        )

        time.sleep(1)

        # Verify contact and conversation_state were created
        contact_resp = requests.get(
            f"{supabase_url}/rest/v1/contacts"
            f"?tenant_id=eq.{tenant_id}&phone=like.*{phone[-8:]}&select=id",
            headers=supabase_headers,
        )
        assert len(contact_resp.json()) >= 1, "Contact should be created after activation"

    def test_04_enable_test_mode_blocks_unknown_numbers(self, supabase_url, supabase_headers, integration_setup):
        """Step 4: Enable test_mode with a specific number, verify blocking."""
        setup = integration_setup
        tenant_id = setup["tenant_id"]
        allowed = "5511900000301"
        blocked = "5511900000402"

        # Enable test_mode
        requests.patch(
            f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}",
            headers=supabase_headers,
            json={"test_mode": True, "test_numbers": [allowed]},
        )

        # Count states before
        before = requests.get(
            f"{supabase_url}/rest/v1/conversation_states?tenant_id=eq.{tenant_id}&select=id",
            headers=supabase_headers,
        )
        count_before = len(before.json()) if before.status_code == 200 else 0

        # Send from blocked number
        resp = send_webhook(setup["instance_id"], blocked, "oi")
        assert resp.status_code == 200

        time.sleep(1)

        # No new conversation_state
        after = requests.get(
            f"{supabase_url}/rest/v1/conversation_states?tenant_id=eq.{tenant_id}&select=id",
            headers=supabase_headers,
        )
        count_after = len(after.json()) if after.status_code == 200 else 0
        assert count_after == count_before, (
            "Blocked number should not create conversation_state"
        )

    def test_05_allowed_number_still_processed_in_test_mode(self, supabase_url, supabase_headers, integration_setup):
        """Step 5: Allowed number should still be processed in test_mode."""
        setup = integration_setup
        tenant_id = setup["tenant_id"]
        allowed = "5511900000301"

        # Ensure test_mode is on with allowed number
        requests.patch(
            f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}",
            headers=supabase_headers,
            json={"test_mode": True, "test_numbers": [allowed]},
        )

        before = requests.get(
            f"{supabase_url}/rest/v1/conversation_states?tenant_id=eq.{tenant_id}&select=id",
            headers=supabase_headers,
        )
        count_before = len(before.json()) if before.status_code == 200 else 0

        resp = send_webhook(setup["instance_id"], allowed, "oi")
        assert resp.status_code == 200

        time.sleep(1)

        after = requests.get(
            f"{supabase_url}/rest/v1/conversation_states?tenant_id=eq.{tenant_id}&select=id",
            headers=supabase_headers,
        )
        count_after = len(after.json()) if after.status_code == 200 else 0
        assert count_after > count_before, (
            "Allowed number should be processed in test_mode"
        )

    def test_06_deactivate_service_resets_everything(self, supabase_url, supabase_headers, integration_setup):
        """Step 6: Deactivating service should block all webhooks regardless of test_mode."""
        setup = integration_setup
        tenant_id = setup["tenant_id"]
        allowed = "5511900000301"

        # Keep test_mode on but deactivate service
        requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{setup['session_id']}",
            headers=supabase_headers,
            json={"service_active": False},
        )

        before = requests.get(
            f"{supabase_url}/rest/v1/conversation_states?tenant_id=eq.{tenant_id}&select=id",
            headers=supabase_headers,
        )
        count_before = len(before.json()) if before.status_code == 200 else 0

        # Even allowed number should be skipped
        resp = send_webhook(setup["instance_id"], allowed, "oi")
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("reason") == "service_inactive", (
            "service_inactive check should take precedence over test_mode"
        )

        time.sleep(1)

        after = requests.get(
            f"{supabase_url}/rest/v1/conversation_states?tenant_id=eq.{tenant_id}&select=id",
            headers=supabase_headers,
        )
        count_after = len(after.json()) if after.status_code == 200 else 0
        assert count_after == count_before, (
            "No new states should be created when service is inactive"
        )

    def test_07_disconnect_auto_deactivates_service(self, supabase_url, supabase_headers, integration_setup):
        """Step 7: Disconnecting session should auto-reset service_active via DB trigger."""
        setup = integration_setup

        # Activate service
        requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{setup['session_id']}",
            headers=supabase_headers,
            json={"status": "connected", "service_active": True},
        )

        # Verify active
        verify = requests.get(
            f"{supabase_url}/rest/v1/whatsapp_sessions"
            f"?id=eq.{setup['session_id']}&select=service_active",
            headers=supabase_headers,
        )
        assert verify.json()[0]["service_active"] is True

        # Simulate disconnect
        requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{setup['session_id']}",
            headers=supabase_headers,
            json={"status": "disconnected"},
        )

        # service_active should be auto-reset
        after = requests.get(
            f"{supabase_url}/rest/v1/whatsapp_sessions"
            f"?id=eq.{setup['session_id']}&select=service_active,status",
            headers=supabase_headers,
        )
        row = after.json()[0]
        assert row["status"] == "disconnected"
        assert row["service_active"] is False, (
            "DB trigger should auto-reset service_active on disconnect"
        )
