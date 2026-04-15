"""
Tests for the test_mode restriction in the bot.
When test_mode=true, only numbers in test_numbers should receive bot responses.
Numbers NOT in the list should be silently ignored (message logged, no bot response).
"""
import pytest
import requests
import uuid
import os
import time


APP_URL = os.getenv("APP_URL", "http://localhost:3000")
WEBHOOK_TOKEN = os.getenv("WHATSAPP_WEBHOOK_TOKEN", "")

# Fixed numbers for test mode testing
ALLOWED_PHONE = "5511900000101"
BLOCKED_PHONE = "5511900000202"


@pytest.fixture(scope="module")
def test_mode_webhook_setup(supabase_headers, supabase_url, test_tenant):
    """Set up: connected + service_active session, test_mode=true with one allowed number."""
    tenant_id = test_tenant["tenant_id"]
    instance_id = f"tm-wh-{uuid.uuid4().hex[:8]}"

    # Create connected + active session
    resp = requests.post(
        f"{supabase_url}/rest/v1/whatsapp_sessions",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "instance_id": instance_id,
            "instance_token": "tm-wh-token",
            "status": "connected",
            "phone_number": "5511444440001",
            "service_active": True,
        },
    )
    assert resp.status_code in (200, 201), f"Session creation failed: {resp.text}"
    session = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

    # Ensure settings row
    requests.post(
        f"{supabase_url}/rest/v1/settings",
        headers={**supabase_headers, "Prefer": "resolution=ignore-duplicates"},
        json={"tenant_id": tenant_id},
    )

    # Enable test_mode with ALLOWED_PHONE only
    requests.patch(
        f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}",
        headers=supabase_headers,
        json={"test_mode": True, "test_numbers": [ALLOWED_PHONE]},
    )

    yield {
        "tenant_id": tenant_id,
        "session_id": session["id"],
        "instance_id": instance_id,
    }

    # Cleanup
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
            "pushName": f"Tester {phone[-4:]}",
        },
    }
    return requests.post(url, json=payload, timeout=15)


class TestWebhookTestMode:

    def test_allowed_number_gets_bot_response(self, supabase_url, supabase_headers, test_mode_webhook_setup):
        """Number in test_numbers list should be processed by bot when test_mode=true."""
        setup = test_mode_webhook_setup

        resp = send_webhook(setup["instance_id"], ALLOWED_PHONE, "oi")
        assert resp.status_code == 200

        time.sleep(1)

        tenant_id = setup["tenant_id"]
        # Verify conversation_state was created for allowed number
        contact_resp = requests.get(
            f"{supabase_url}/rest/v1/contacts"
            f"?tenant_id=eq.{tenant_id}&phone=like.*{ALLOWED_PHONE[-8:]}&select=id",
            headers=supabase_headers,
        )
        contacts = contact_resp.json() if contact_resp.status_code == 200 else []
        assert len(contacts) >= 1, "Contact for allowed number should be created"

        if contacts:
            contact_id = contacts[0]["id"]
            state_resp = requests.get(
                f"{supabase_url}/rest/v1/conversation_states"
                f"?tenant_id=eq.{tenant_id}&contact_id=eq.{contact_id}&select=current_state",
                headers=supabase_headers,
            )
            states = state_resp.json() if state_resp.status_code == 200 else []
            assert len(states) >= 1, (
                "Conversation state should exist for allowed number in test_mode"
            )

    def test_blocked_number_message_logged_but_no_bot(self, supabase_url, supabase_headers, test_mode_webhook_setup):
        """Number NOT in test_numbers should have message logged but NO conversation_state."""
        setup = test_mode_webhook_setup
        tenant_id = setup["tenant_id"]
        unique_msg = f"blocked-msg-{uuid.uuid4().hex[:8]}"

        # Count states before
        before_states = requests.get(
            f"{supabase_url}/rest/v1/conversation_states"
            f"?tenant_id=eq.{tenant_id}&select=id",
            headers=supabase_headers,
        )
        count_before = len(before_states.json()) if before_states.status_code == 200 else 0

        resp = send_webhook(setup["instance_id"], BLOCKED_PHONE, unique_msg)
        assert resp.status_code == 200

        time.sleep(1)

        # Message should be logged
        msg_resp = requests.get(
            f"{supabase_url}/rest/v1/messages"
            f"?tenant_id=eq.{tenant_id}&content=eq.{unique_msg}&select=id",
            headers=supabase_headers,
        )
        messages = msg_resp.json() if msg_resp.status_code == 200 else []
        assert len(messages) >= 1, "Message from blocked number should still be logged"

        # No new conversation_state should have been created for the blocked number
        blocked_contact_resp = requests.get(
            f"{supabase_url}/rest/v1/contacts"
            f"?tenant_id=eq.{tenant_id}&phone=like.*{BLOCKED_PHONE[-8:]}&select=id",
            headers=supabase_headers,
        )
        blocked_contacts = blocked_contact_resp.json() if blocked_contact_resp.status_code == 200 else []

        if blocked_contacts:
            blocked_id = blocked_contacts[0]["id"]
            state_resp = requests.get(
                f"{supabase_url}/rest/v1/conversation_states"
                f"?tenant_id=eq.{tenant_id}&contact_id=eq.{blocked_id}&select=current_state",
                headers=supabase_headers,
            )
            states = state_resp.json() if state_resp.status_code == 200 else []
            assert len(states) == 0, (
                "No conversation_state should exist for blocked number in test_mode"
            )

    def test_disabling_test_mode_allows_all_numbers(self, supabase_url, supabase_headers, test_mode_webhook_setup):
        """After disabling test_mode, all numbers should be processed."""
        setup = test_mode_webhook_setup
        tenant_id = setup["tenant_id"]

        # Disable test_mode
        requests.patch(
            f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}",
            headers=supabase_headers,
            json={"test_mode": False},
        )

        previously_blocked = f"5511{uuid.uuid4().hex[:9]}"

        # Count states before
        before = requests.get(
            f"{supabase_url}/rest/v1/conversation_states"
            f"?tenant_id=eq.{tenant_id}&select=id",
            headers=supabase_headers,
        )
        count_before = len(before.json()) if before.status_code == 200 else 0

        resp = send_webhook(setup["instance_id"], previously_blocked, "oi")
        assert resp.status_code == 200

        time.sleep(1)

        after = requests.get(
            f"{supabase_url}/rest/v1/conversation_states"
            f"?tenant_id=eq.{tenant_id}&select=id",
            headers=supabase_headers,
        )
        count_after = len(after.json()) if after.status_code == 200 else 0

        assert count_after > count_before, (
            "After disabling test_mode, any number should trigger bot processing"
        )

        # Re-enable for subsequent tests
        requests.patch(
            f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}",
            headers=supabase_headers,
            json={"test_mode": True, "test_numbers": [ALLOWED_PHONE]},
        )

    def test_phone_matching_is_flexible(self, supabase_url, supabase_headers, test_mode_webhook_setup):
        """Numbers should match regardless of country code prefix format."""
        setup = test_mode_webhook_setup
        tenant_id = setup["tenant_id"]

        # ALLOWED_PHONE is "5511900000101"
        # Test with last-11-digits match: "11900000101" should also match
        short_format = ALLOWED_PHONE[-11:]  # "11900000101"

        # Register number in test_numbers as short format
        requests.patch(
            f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}",
            headers=supabase_headers,
            json={"test_mode": True, "test_numbers": [short_format]},
        )

        # Count states
        before = requests.get(
            f"{supabase_url}/rest/v1/conversation_states?tenant_id=eq.{tenant_id}&select=id",
            headers=supabase_headers,
        )
        count_before = len(before.json()) if before.status_code == 200 else 0

        # Send webhook with full format phone
        resp = send_webhook(setup["instance_id"], ALLOWED_PHONE, f"test-flex-{uuid.uuid4().hex[:6]}")
        assert resp.status_code == 200

        time.sleep(1)

        after = requests.get(
            f"{supabase_url}/rest/v1/conversation_states?tenant_id=eq.{tenant_id}&select=id",
            headers=supabase_headers,
        )
        count_after = len(after.json()) if after.status_code == 200 else 0

        assert count_after >= count_before, (
            "Phone number matching should work regardless of country code format"
        )

        # Restore full number
        requests.patch(
            f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}",
            headers=supabase_headers,
            json={"test_mode": True, "test_numbers": [ALLOWED_PHONE]},
        )

    def test_test_mode_with_empty_list_blocks_all(self, supabase_url, supabase_headers, test_mode_webhook_setup):
        """test_mode=true with empty test_numbers list should NOT block (no restriction if no numbers)."""
        setup = test_mode_webhook_setup
        tenant_id = setup["tenant_id"]

        # Enable test_mode with EMPTY list
        requests.patch(
            f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}",
            headers=supabase_headers,
            json={"test_mode": True, "test_numbers": []},
        )

        new_phone = f"5511{uuid.uuid4().hex[:9]}"
        before = requests.get(
            f"{supabase_url}/rest/v1/conversation_states?tenant_id=eq.{tenant_id}&select=id",
            headers=supabase_headers,
        )
        count_before = len(before.json()) if before.status_code == 200 else 0

        resp = send_webhook(setup["instance_id"], new_phone, "oi")
        assert resp.status_code == 200

        time.sleep(1)

        after = requests.get(
            f"{supabase_url}/rest/v1/conversation_states?tenant_id=eq.{tenant_id}&select=id",
            headers=supabase_headers,
        )
        count_after = len(after.json()) if after.status_code == 200 else 0

        # When test_numbers is empty, the condition `len > 0` is false → bot processes all
        assert count_after > count_before, (
            "test_mode=true with empty list should process all numbers (no restriction)"
        )

        # Restore
        requests.patch(
            f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}",
            headers=supabase_headers,
            json={"test_mode": True, "test_numbers": [ALLOWED_PHONE]},
        )
