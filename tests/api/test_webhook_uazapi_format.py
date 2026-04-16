"""
Tests for the actual uazapi webhook payload format.
uazapi uses: EventType (not event), data.sender/data.text/data.fromMe/data.senderName
instead of Baileys-style data.key.remoteJid/data.message.conversation
"""
import pytest
import requests
import uuid
import time
import os

APP_URL = os.getenv("APP_URL", "http://localhost:3000")
WEBHOOK_TOKEN = os.getenv("WHATSAPP_WEBHOOK_TOKEN", "")


@pytest.fixture(scope="module")
def uazapi_session(supabase_headers, supabase_url, test_tenant):
    """Create a connected session for uazapi format tests."""
    tenant_id = test_tenant["tenant_id"]
    instance_token = f"uazapi-tok-{uuid.uuid4().hex[:12]}"
    instance_id = f"uazapi-inst-{uuid.uuid4().hex[:8]}"

    resp = requests.post(
        f"{supabase_url}/rest/v1/whatsapp_sessions",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "instance_id": instance_id,
            "instance_token": instance_token,
            "status": "connected",
            "phone_number": "5511666660001",
            "service_active": True,
        },
    )
    assert resp.status_code in (200, 201), f"Session creation failed: {resp.text}"
    session = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

    yield {
        "tenant_id": tenant_id,
        "session_id": session["id"],
        "instance_id": instance_id,
        "instance_token": instance_token,
    }

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


def _send_webhook(payload: dict) -> requests.Response:
    url = f"{APP_URL}/api/webhooks/whatsapp"
    if WEBHOOK_TOKEN:
        url += f"?token={WEBHOOK_TOKEN}"
    return requests.post(url, json=payload, timeout=15)


class TestUazapiWebhookFormat:

    def test_eventype_field_accepted(self, uazapi_session):
        """uazapi sends EventType (capital E,T) not event — must be accepted."""
        phone = f"5511{uuid.uuid4().hex[:9]}"
        payload = {
            "EventType": "messages",
            "token": uazapi_session["instance_token"],
            "instance": uazapi_session["instance_id"],
            "data": {
                "sender": f"{phone}@s.whatsapp.net",
                "text": "oi",
                "fromMe": False,
                "senderName": "Teste uazapi",
            },
        }
        resp = _send_webhook(payload)
        assert resp.status_code == 200, f"Unexpected status: {resp.status_code} {resp.text}"
        body = resp.json()
        assert body.get("success") is True
        assert body.get("skipped") is not True or body.get("reason") == "service_inactive", (
            f"Message should be processed, got: {body}"
        )

    def test_data_sender_field_extracts_phone(self, supabase_url, supabase_headers, uazapi_session):
        """data.sender (uazapi format) should correctly extract the phone number."""
        phone = f"5511{uuid.uuid4().hex[:9]}"
        tenant_id = uazapi_session["tenant_id"]

        payload = {
            "EventType": "messages",
            "token": uazapi_session["instance_token"],
            "data": {
                "sender": f"{phone}@s.whatsapp.net",
                "text": f"test-uazapi-sender-{uuid.uuid4().hex[:6]}",
                "fromMe": False,
                "senderName": "Teste Sender",
            },
        }
        resp = _send_webhook(payload)
        assert resp.status_code == 200

        time.sleep(1)

        contact_resp = requests.get(
            f"{supabase_url}/rest/v1/contacts"
            f"?tenant_id=eq.{tenant_id}&phone=like.*{phone[-8:]}&select=id,phone",
            headers=supabase_headers,
        )
        assert contact_resp.status_code == 200
        contacts = contact_resp.json()
        assert len(contacts) >= 1, f"Contact should be created from data.sender, phone={phone}"

    def test_data_text_field_logged(self, supabase_url, supabase_headers, uazapi_session):
        """data.text (uazapi format) should be logged as message content."""
        phone = f"5511{uuid.uuid4().hex[:9]}"
        tenant_id = uazapi_session["tenant_id"]
        test_text = f"uazapi-text-{uuid.uuid4().hex[:8]}"

        payload = {
            "EventType": "messages",
            "token": uazapi_session["instance_token"],
            "data": {
                "sender": f"{phone}@s.whatsapp.net",
                "text": test_text,
                "fromMe": False,
            },
        }
        resp = _send_webhook(payload)
        assert resp.status_code == 200

        time.sleep(1)

        msg_resp = requests.get(
            f"{supabase_url}/rest/v1/messages"
            f"?tenant_id=eq.{tenant_id}&content=eq.{test_text}&select=id,content,direction",
            headers=supabase_headers,
        )
        assert msg_resp.status_code == 200
        messages = msg_resp.json()
        assert len(messages) >= 1, f"Message with data.text='{test_text}' should be logged"
        assert messages[0]["direction"] == "in"

    def test_fromme_true_is_skipped(self, uazapi_session):
        """data.fromMe=True (uazapi format) should be skipped."""
        phone = f"5511{uuid.uuid4().hex[:9]}"
        payload = {
            "EventType": "messages",
            "token": uazapi_session["instance_token"],
            "data": {
                "sender": f"{phone}@s.whatsapp.net",
                "text": "mensagem enviada por mim",
                "fromMe": True,
            },
        }
        resp = _send_webhook(payload)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("skipped") is True, "fromMe=True should be skipped"

    def test_token_based_tenant_lookup(self, supabase_url, supabase_headers, uazapi_session):
        """Tenant should be found via body.token (instance token) without instance ID."""
        phone = f"5511{uuid.uuid4().hex[:9]}"
        tenant_id = uazapi_session["tenant_id"]

        # Send without instance field — only token
        payload = {
            "EventType": "messages",
            "token": uazapi_session["instance_token"],
            "data": {
                "sender": f"{phone}@s.whatsapp.net",
                "text": "lookup by token only",
                "fromMe": False,
            },
        }
        resp = _send_webhook(payload)
        assert resp.status_code == 200, f"Should find tenant by token: {resp.text}"
        body = resp.json()
        assert body.get("success") is True

    def test_unknown_event_type_is_skipped(self, uazapi_session):
        """Unknown event types (connection, status) should be skipped gracefully."""
        payload = {
            "EventType": "connection",
            "token": uazapi_session["instance_token"],
            "data": {"status": "connected"},
        }
        resp = _send_webhook(payload)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("skipped") is True
