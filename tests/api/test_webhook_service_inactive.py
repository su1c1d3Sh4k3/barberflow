"""
Tests that incoming webhooks are skipped (message logged, bot NOT processed)
when whatsapp_sessions.service_active = false.
"""
import pytest
import requests
import uuid
import os
import time


APP_URL = os.getenv("APP_URL", "http://localhost:3000")
WEBHOOK_TOKEN = os.getenv("WHATSAPP_WEBHOOK_TOKEN", "")


@pytest.fixture(scope="module")
def inactive_setup(supabase_headers, supabase_url, test_tenant):
    """Create a connected but service_active=false session."""
    tenant_id = test_tenant["tenant_id"]
    instance_id = f"inactive-{uuid.uuid4().hex[:8]}"
    contact_phone = f"5511{uuid.uuid4().hex[:9]}"

    # Create connected session with service_active=false
    resp = requests.post(
        f"{supabase_url}/rest/v1/whatsapp_sessions",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "instance_id": instance_id,
            "instance_token": "inactive-token",
            "status": "connected",
            "phone_number": "5511555550001",
            "service_active": False,
        },
    )
    assert resp.status_code in (200, 201), f"Session creation failed: {resp.text}"
    session = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

    yield {
        "tenant_id": tenant_id,
        "session_id": session["id"],
        "instance_id": instance_id,
        "contact_phone": contact_phone,
    }

    # Cleanup session and related data
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


def build_webhook_payload(instance_id: str, phone: str, message: str) -> dict:
    return {
        "event": "messages",
        "instance": {"id": instance_id},
        "data": {
            "key": {
                "remoteJid": f"{phone}@s.whatsapp.net",
                "fromMe": False,
                "id": f"MSG{uuid.uuid4().hex[:12].upper()}",
            },
            "message": {"conversation": message},
            "pushName": "Teste Inativo",
        },
    }


class TestWebhookServiceInactive:

    def _send_webhook(self, payload: dict) -> requests.Response:
        url = f"{APP_URL}/api/webhooks/whatsapp"
        if WEBHOOK_TOKEN:
            url += f"?token={WEBHOOK_TOKEN}"
        return requests.post(url, json=payload, timeout=15)

    def test_webhook_returns_200_with_skipped_true(self, supabase_url, supabase_headers, inactive_setup):
        """Webhook with service_active=false should return 200 with skipped=true."""
        payload = build_webhook_payload(
            inactive_setup["instance_id"],
            inactive_setup["contact_phone"],
            "oi quero agendar",
        )
        resp = self._send_webhook(payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body.get("success") is True
        assert body.get("skipped") is True
        assert body.get("reason") == "service_inactive", (
            f"Expected reason='service_inactive', got {body.get('reason')}"
        )

    def test_message_is_logged_even_when_inactive(self, supabase_url, supabase_headers, inactive_setup):
        """Even when service is inactive, the inbound message should be logged."""
        contact_phone = f"5511{uuid.uuid4().hex[:9]}"
        test_message = f"teste-inactive-log-{uuid.uuid4().hex[:6]}"

        payload = build_webhook_payload(
            inactive_setup["instance_id"],
            contact_phone,
            test_message,
        )
        resp = self._send_webhook(payload)
        assert resp.status_code == 200

        # Wait briefly for DB write
        time.sleep(1)

        # Check that message was logged
        tenant_id = inactive_setup["tenant_id"]
        msg_resp = requests.get(
            f"{supabase_url}/rest/v1/messages"
            f"?tenant_id=eq.{tenant_id}&content=eq.{test_message}&select=id,content,direction",
            headers=supabase_headers,
        )
        assert msg_resp.status_code == 200
        messages = msg_resp.json()
        assert len(messages) >= 1, "Message should be logged even when service_inactive"
        assert messages[0]["direction"] == "in"

    def test_contact_is_created_when_inactive(self, supabase_url, supabase_headers, inactive_setup):
        """Contact should be created/found even when service is inactive."""
        contact_phone = f"5511{uuid.uuid4().hex[:9]}"

        payload = build_webhook_payload(
            inactive_setup["instance_id"],
            contact_phone,
            "oi",
        )
        resp = self._send_webhook(payload)
        assert resp.status_code == 200

        time.sleep(1)

        # Check contact was created
        tenant_id = inactive_setup["tenant_id"]
        contact_resp = requests.get(
            f"{supabase_url}/rest/v1/contacts"
            f"?tenant_id=eq.{tenant_id}&phone=like.*{contact_phone[-8:]}&select=id,phone",
            headers=supabase_headers,
        )
        assert contact_resp.status_code == 200
        assert len(contact_resp.json()) >= 1, "Contact should be created even when service_inactive"

    def test_no_conversation_state_created_when_inactive(self, supabase_url, supabase_headers, inactive_setup):
        """No conversation_state should be created when service is inactive (bot not run)."""
        contact_phone = f"5511{uuid.uuid4().hex[:9]}"
        tenant_id = inactive_setup["tenant_id"]

        # Count conversation_states before
        before = requests.get(
            f"{supabase_url}/rest/v1/conversation_states"
            f"?tenant_id=eq.{tenant_id}&select=id",
            headers=supabase_headers,
        )
        count_before = len(before.json()) if before.status_code == 200 else 0

        payload = build_webhook_payload(
            inactive_setup["instance_id"],
            contact_phone,
            "ola quero marcar horario",
        )
        resp = self._send_webhook(payload)
        assert resp.status_code == 200

        time.sleep(1)

        # Count conversation_states after
        after = requests.get(
            f"{supabase_url}/rest/v1/conversation_states"
            f"?tenant_id=eq.{tenant_id}&select=id",
            headers=supabase_headers,
        )
        count_after = len(after.json()) if after.status_code == 200 else 0

        assert count_after == count_before, (
            "No new conversation_state should be created when service is inactive"
        )

    def test_webhook_active_processes_normally(self, supabase_url, supabase_headers, inactive_setup):
        """After activating service, webhooks should be processed normally."""
        session_id = inactive_setup["session_id"]
        tenant_id = inactive_setup["tenant_id"]

        # Activate service
        requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session_id}",
            headers=supabase_headers,
            json={"service_active": True},
        )

        contact_phone = f"5511{uuid.uuid4().hex[:9]}"
        payload = build_webhook_payload(
            inactive_setup["instance_id"],
            contact_phone,
            "oi",
        )
        resp = self._send_webhook(payload)
        assert resp.status_code == 200
        body = resp.json()
        # Should NOT be skipped
        assert body.get("skipped") is not True or body.get("reason") != "service_inactive", (
            "Webhook should be processed when service_active=true"
        )

        time.sleep(1)

        # Verify conversation_state was created
        # (contact was processed through bot)
        contact_resp = requests.get(
            f"{supabase_url}/rest/v1/contacts"
            f"?tenant_id=eq.{tenant_id}&phone=like.*{contact_phone[-8:]}&select=id",
            headers=supabase_headers,
        )
        contacts = contact_resp.json() if contact_resp.status_code == 200 else []

        if contacts:
            contact_id = contacts[0]["id"]
            state_resp = requests.get(
                f"{supabase_url}/rest/v1/conversation_states"
                f"?tenant_id=eq.{tenant_id}&contact_id=eq.{contact_id}&select=current_state",
                headers=supabase_headers,
            )
            states = state_resp.json() if state_resp.status_code == 200 else []
            assert len(states) >= 1, "Conversation state should exist after bot processing"

        # Reset to inactive
        requests.patch(
            f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session_id}",
            headers=supabase_headers,
            json={"service_active": False},
        )
