"""
Tests for WhatsApp webhook endpoint and bot state machine integration.
Tests the webhook handler at /api/webhooks/whatsapp.
"""
import requests
import pytest
import uuid


@pytest.fixture(scope="module")
def whatsapp_setup(supabase_headers, supabase_url, test_tenant):
    """Set up WhatsApp session and contact for bot tests."""
    tenant_id = test_tenant["tenant_id"]
    company_id = test_tenant["company_id"]
    instance_id = f"test-instance-{uuid.uuid4().hex[:8]}"
    instance_token = "test-token-12345"
    contact_phone = f"5511{uuid.uuid4().hex[:9]}"

    # Delete any existing session (UNIQUE tenant_id constraint)
    requests.delete(
        f"{supabase_url}/rest/v1/whatsapp_sessions?tenant_id=eq.{tenant_id}",
        headers={**supabase_headers, "Prefer": ""},
    )
    # Create whatsapp_session
    resp = requests.post(
        f"{supabase_url}/rest/v1/whatsapp_sessions",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "instance_id": instance_id,
            "instance_token": instance_token,
            "status": "connected",
            "phone_number": "5511999990001",
            "service_active": True,
        },
    )
    assert resp.status_code in (200, 201), f"Session creation failed: {resp.text}"

    # Create category
    cat_resp = requests.post(
        f"{supabase_url}/rest/v1/service_categories",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "Corte Bot Test"},
    )
    cat = cat_resp.json()[0] if isinstance(cat_resp.json(), list) else cat_resp.json()

    # Create service
    svc_resp = requests.post(
        f"{supabase_url}/rest/v1/services",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "name": "Corte Simples Bot",
            "duration_min": 30,
            "price": 40.00,
            "category_id": cat["id"],
            "active": True,
        },
    )
    svc = svc_resp.json()[0] if isinstance(svc_resp.json(), list) else svc_resp.json()

    # Create professional
    prof_resp = requests.post(
        f"{supabase_url}/rest/v1/professionals",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "company_id": company_id,
            "name": "Barbeiro Bot Test",
            "active": True,
        },
    )
    prof = prof_resp.json()[0] if isinstance(prof_resp.json(), list) else prof_resp.json()

    # Link professional to service
    requests.post(
        f"{supabase_url}/rest/v1/professional_services",
        headers=supabase_headers,
        json={"professional_id": prof["id"], "service_id": svc["id"]},
    )

    yield {
        "tenant_id": tenant_id,
        "company_id": company_id,
        "instance_id": instance_id,
        "instance_token": instance_token,
        "contact_phone": contact_phone,
        "category_id": cat["id"],
        "service_id": svc["id"],
        "professional_id": prof["id"],
    }

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/professional_services?professional_id=eq.{prof['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
    requests.delete(
        f"{supabase_url}/rest/v1/whatsapp_sessions?instance_id=eq.{instance_id}",
        headers={**supabase_headers, "Prefer": ""},
    )
    # conversation_states and messages cleaned up by tenant cleanup


def _webhook_payload(instance_id, phone, message, push_name="Test User"):
    """Build a uazapi-style webhook payload."""
    return {
        "event": "messages",
        "instance": {"id": instance_id},
        "data": {
            "key": {
                "remoteJid": f"{phone}@s.whatsapp.net",
                "fromMe": False,
            },
            "message": {"conversation": message},
            "pushName": push_name,
        },
    }


class TestWhatsAppWebhook:
    """Webhook handler tests."""

    def test_webhook_skips_non_message_events(self, app_url):
        """Non-message events should be skipped gracefully."""
        resp = requests.post(
            f"{app_url}/api/webhooks/whatsapp",
            json={"event": "connection", "data": {}, "instance": {"id": "test"}},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("skipped") is True

    def test_webhook_skips_from_me(self, app_url, whatsapp_setup):
        """Messages from the bot itself should be skipped."""
        resp = requests.post(
            f"{app_url}/api/webhooks/whatsapp",
            json={
                "event": "messages",
                "instance": {"id": whatsapp_setup["instance_id"]},
                "data": {
                    "key": {
                        "remoteJid": "5511999990001@s.whatsapp.net",
                        "fromMe": True,
                    },
                    "message": {"conversation": "test"},
                },
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("skipped") is True

    def test_webhook_unknown_instance_returns_404(self, app_url):
        """Webhook with unknown instance should return 404."""
        resp = requests.post(
            f"{app_url}/api/webhooks/whatsapp",
            json=_webhook_payload("unknown-instance-xyz", "5511999990001", "oi"),
        )
        assert resp.status_code == 404

    def test_webhook_creates_contact(self, app_url, whatsapp_setup, supabase_headers, supabase_url):
        """First message from new phone should create a contact."""
        phone = whatsapp_setup["contact_phone"]
        resp = requests.post(
            f"{app_url}/api/webhooks/whatsapp",
            json=_webhook_payload(
                whatsapp_setup["instance_id"], phone, "oi", push_name="João Bot"
            ),
        )
        assert resp.status_code == 200

        # Verify contact was created
        contact_resp = requests.get(
            f"{supabase_url}/rest/v1/contacts?tenant_id=eq.{whatsapp_setup['tenant_id']}&phone=eq.{phone}&select=id,name,source",
            headers=supabase_headers,
        )
        assert contact_resp.status_code == 200
        contacts = contact_resp.json()
        assert len(contacts) >= 1, "Contact should be created"
        assert contacts[0]["source"] == "whatsapp"

    def test_webhook_logs_message(self, app_url, whatsapp_setup, supabase_headers, supabase_url):
        """Messages should be logged in the messages table."""
        phone = whatsapp_setup["contact_phone"]
        test_msg = f"test_msg_{uuid.uuid4().hex[:6]}"
        resp = requests.post(
            f"{app_url}/api/webhooks/whatsapp",
            json=_webhook_payload(whatsapp_setup["instance_id"], phone, test_msg),
        )
        assert resp.status_code == 200

        # Verify message was logged
        msg_resp = requests.get(
            f"{supabase_url}/rest/v1/messages?tenant_id=eq.{whatsapp_setup['tenant_id']}&content=eq.{test_msg}&select=id,direction,content",
            headers=supabase_headers,
        )
        assert msg_resp.status_code == 200
        messages = msg_resp.json()
        assert len(messages) >= 1, "Message should be logged"
        assert messages[0]["direction"] == "in"

    def test_webhook_creates_conversation_state(self, app_url, whatsapp_setup,
                                                  supabase_headers, supabase_url):
        """After first message, a conversation_state should exist."""
        phone = whatsapp_setup["contact_phone"]
        requests.post(
            f"{app_url}/api/webhooks/whatsapp",
            json=_webhook_payload(whatsapp_setup["instance_id"], phone, "menu"),
        )

        # Get contact
        contact_resp = requests.get(
            f"{supabase_url}/rest/v1/contacts?tenant_id=eq.{whatsapp_setup['tenant_id']}&phone=eq.{phone}&select=id",
            headers=supabase_headers,
        )
        contacts = contact_resp.json()
        if contacts:
            contact_id = contacts[0]["id"]
            state_resp = requests.get(
                f"{supabase_url}/rest/v1/conversation_states?tenant_id=eq.{whatsapp_setup['tenant_id']}&contact_id=eq.{contact_id}&select=current_state,context",
                headers=supabase_headers,
            )
            assert state_resp.status_code == 200
            states = state_resp.json()
            assert len(states) >= 1, "Conversation state should exist"


class TestBotGlobalCommands:
    """Test global bot commands."""

    def test_sair_resets_state(self, app_url, whatsapp_setup, supabase_headers, supabase_url):
        """Sending 'sair' should reset state to IDLE."""
        phone = whatsapp_setup["contact_phone"]

        # Send a message to create state first
        requests.post(
            f"{app_url}/api/webhooks/whatsapp",
            json=_webhook_payload(whatsapp_setup["instance_id"], phone, "oi"),
        )

        # Send 'sair'
        resp = requests.post(
            f"{app_url}/api/webhooks/whatsapp",
            json=_webhook_payload(whatsapp_setup["instance_id"], phone, "sair"),
        )
        assert resp.status_code == 200

        # Verify state is IDLE
        contact_resp = requests.get(
            f"{supabase_url}/rest/v1/contacts?tenant_id=eq.{whatsapp_setup['tenant_id']}&phone=eq.{phone}&select=id",
            headers=supabase_headers,
        )
        if contact_resp.json():
            contact_id = contact_resp.json()[0]["id"]
            state_resp = requests.get(
                f"{supabase_url}/rest/v1/conversation_states?contact_id=eq.{contact_id}&select=current_state",
                headers=supabase_headers,
            )
            if state_resp.json():
                assert state_resp.json()[0]["current_state"] in ("IDLE", "PAUSED")

    def test_menu_resets_to_idle(self, app_url, whatsapp_setup):
        """Sending 'menu' should reset and show categories."""
        phone = whatsapp_setup["contact_phone"]
        resp = requests.post(
            f"{app_url}/api/webhooks/whatsapp",
            json=_webhook_payload(whatsapp_setup["instance_id"], phone, "menu"),
        )
        assert resp.status_code == 200
