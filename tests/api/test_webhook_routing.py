"""
Tests for webhook routing logic (targets Supabase Edge Function directly):
1. Test mode blocks ALL non-whitelisted numbers (even with empty list)
2. IA mode: when ia_settings.enabled=true → routes to n8n, bot does NOT run
3. Bot mode: when ia_settings.enabled=false → bot runs normally
4. Data isolation: each tenant only accesses its own data
"""
import pytest
import requests
import uuid
import time
import os

EDGE_FUNCTION_URL = "https://vpvsrqkptvphkivwqxoy.supabase.co/functions/v1/whatsapp-webhook"


def _send_webhook(payload: dict) -> requests.Response:
    return requests.post(EDGE_FUNCTION_URL, json=payload, timeout=20)


def _upsert_session(supabase_url, supabase_headers, tenant_id, service_active=True, instance_id_override=None):
    """Upsert a WhatsApp session for a tenant (one per tenant due to unique constraint)."""
    instance_token = f"tok-{uuid.uuid4().hex[:12]}"
    instance_id = instance_id_override or f"inst-{uuid.uuid4().hex[:8]}"
    resp = requests.post(
        f"{supabase_url}/rest/v1/whatsapp_sessions",
        headers={**supabase_headers, "Prefer": "resolution=merge-duplicates,return=representation"},
        json={
            "tenant_id": tenant_id,
            "instance_id": instance_id,
            "instance_token": instance_token,
            "status": "connected",
            "phone_number": "5511900000001",
            "service_active": service_active,
        },
    )
    assert resp.status_code in (200, 201), f"Session upsert failed: {resp.text}"
    session = resp.json()
    session = session[0] if isinstance(session, list) else session
    return {"id": session["id"], "instance_token": instance_token, "instance_id": instance_id}


def _set_test_mode(supabase_url, supabase_headers, tenant_id, enabled: bool, numbers: list):
    requests.post(
        f"{supabase_url}/rest/v1/settings",
        headers={**supabase_headers, "Prefer": "resolution=merge-duplicates"},
        json={"tenant_id": tenant_id, "test_mode": enabled, "test_numbers": numbers},
    )
    requests.patch(
        f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}",
        headers=supabase_headers,
        json={"test_mode": enabled, "test_numbers": numbers},
    )


def _set_ia_mode(supabase_url, supabase_headers, tenant_id, enabled: bool):
    requests.post(
        f"{supabase_url}/rest/v1/ia_settings",
        headers={**supabase_headers, "Prefer": "resolution=merge-duplicates"},
        json={"tenant_id": tenant_id, "enabled": enabled},
    )
    requests.patch(
        f"{supabase_url}/rest/v1/ia_settings?tenant_id=eq.{tenant_id}",
        headers=supabase_headers,
        json={"enabled": enabled},
    )


def _reset_tenant_state(supabase_url, supabase_headers, tenant_id):
    """Reset test mode, IA mode and clean contacts/messages between tests."""
    _set_test_mode(supabase_url, supabase_headers, tenant_id, False, [])
    _set_ia_mode(supabase_url, supabase_headers, tenant_id, False)
    for table in ["conversation_states", "messages", "contacts"]:
        requests.delete(
            f"{supabase_url}/rest/v1/{table}?tenant_id=eq.{tenant_id}",
            headers={**supabase_headers, "Prefer": ""},
        )


# ─── Module fixture: one session shared across all tests in this file ─────────

@pytest.fixture(scope="module")
def routing_session(supabase_headers, supabase_url, test_tenant):
    """Single session reused by all tests in this module."""
    tenant_id = test_tenant["tenant_id"]
    # Remove any leftover session
    requests.delete(
        f"{supabase_url}/rest/v1/whatsapp_sessions?tenant_id=eq.{tenant_id}",
        headers={**supabase_headers, "Prefer": ""},
    )
    session = _upsert_session(supabase_url, supabase_headers, tenant_id)
    yield {**session, "tenant_id": tenant_id}
    # Cleanup
    _reset_tenant_state(supabase_url, supabase_headers, tenant_id)
    requests.delete(
        f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


# ─── Test Mode Tests ─────────────────────────────────────────────────────────

class TestTestModeBlocking:

    def test_test_mode_off_allows_any_number(self, supabase_url, supabase_headers, routing_session):
        """When test_mode=false, any number is accepted."""
        tid = routing_session["tenant_id"]
        _reset_tenant_state(supabase_url, supabase_headers, tid)

        phone = f"5511{uuid.uuid4().hex[:9]}"
        resp = _send_webhook({
            "EventType": "messages",
            "token": routing_session["instance_token"],
            "data": {"sender": f"{phone}@s.whatsapp.net", "text": "oi", "fromMe": False},
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("reason") != "test_mode_blocked", f"Should not be blocked: {body}"

    def test_test_mode_on_blocks_unlisted_number(self, supabase_url, supabase_headers, routing_session):
        """When test_mode=true, a number NOT in test_numbers is blocked."""
        tid = routing_session["tenant_id"]
        _reset_tenant_state(supabase_url, supabase_headers, tid)
        _set_test_mode(supabase_url, supabase_headers, tid, True, ["5511999999999"])

        unlisted_phone = f"5521{uuid.uuid4().hex[:9]}"
        resp = _send_webhook({
            "EventType": "messages",
            "token": routing_session["instance_token"],
            "data": {"sender": f"{unlisted_phone}@s.whatsapp.net", "text": "oi", "fromMe": False},
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("skipped") is True, f"Unlisted number should be blocked: {body}"
        assert body.get("reason") == "test_mode_blocked", f"Wrong reason: {body}"

    def test_test_mode_on_with_empty_list_blocks_everyone(self, supabase_url, supabase_headers, routing_session):
        """When test_mode=true and test_numbers=[], ALL numbers are blocked."""
        tid = routing_session["tenant_id"]
        _reset_tenant_state(supabase_url, supabase_headers, tid)
        _set_test_mode(supabase_url, supabase_headers, tid, True, [])

        phone = f"5511{uuid.uuid4().hex[:9]}"
        resp = _send_webhook({
            "EventType": "messages",
            "token": routing_session["instance_token"],
            "data": {"sender": f"{phone}@s.whatsapp.net", "text": "oi", "fromMe": False},
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("skipped") is True, f"Should be blocked with empty test_numbers: {body}"
        assert body.get("reason") == "test_mode_blocked", f"Wrong reason: {body}"

    def test_test_mode_on_allows_listed_number(self, supabase_url, supabase_headers, routing_session):
        """When test_mode=true, a number IN test_numbers is allowed."""
        tid = routing_session["tenant_id"]
        _reset_tenant_state(supabase_url, supabase_headers, tid)
        allowed_phone = "5511" + uuid.uuid4().hex[:9]
        _set_test_mode(supabase_url, supabase_headers, tid, True, [allowed_phone])

        resp = _send_webhook({
            "EventType": "messages",
            "token": routing_session["instance_token"],
            "data": {"sender": f"{allowed_phone}@s.whatsapp.net", "text": "oi", "fromMe": False},
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("reason") != "test_mode_blocked", f"Listed number should pass: {body}"

    def test_test_mode_blocks_before_contact_creation(self, supabase_url, supabase_headers, routing_session):
        """When test_mode blocks a number, no contact should be created."""
        tid = routing_session["tenant_id"]
        _reset_tenant_state(supabase_url, supabase_headers, tid)
        _set_test_mode(supabase_url, supabase_headers, tid, True, ["5511999999999"])

        phone = f"5521{uuid.uuid4().hex[:9]}"
        resp = _send_webhook({
            "EventType": "messages",
            "token": routing_session["instance_token"],
            "data": {"sender": f"{phone}@s.whatsapp.net", "text": "mensagem bloqueada", "fromMe": False},
        })
        assert resp.status_code == 200
        assert resp.json().get("reason") == "test_mode_blocked"

        time.sleep(1)
        contact_resp = requests.get(
            f"{supabase_url}/rest/v1/contacts?tenant_id=eq.{tid}&phone=like.*{phone[-8:]}",
            headers=supabase_headers,
        )
        assert contact_resp.status_code == 200
        assert len(contact_resp.json()) == 0, "No contact should be created for blocked number"

    def test_test_mode_blocks_even_when_ia_enabled(self, supabase_url, supabase_headers, routing_session):
        """Test mode must block BEFORE the IA routing check."""
        tid = routing_session["tenant_id"]
        _reset_tenant_state(supabase_url, supabase_headers, tid)
        _set_test_mode(supabase_url, supabase_headers, tid, True, ["5511999999999"])
        _set_ia_mode(supabase_url, supabase_headers, tid, True)

        phone = f"5521{uuid.uuid4().hex[:9]}"
        resp = _send_webhook({
            "EventType": "messages",
            "token": routing_session["instance_token"],
            "data": {"sender": f"{phone}@s.whatsapp.net", "text": "oi", "fromMe": False},
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("reason") == "test_mode_blocked", (
            f"Test mode must block before IA routing: {body}"
        )


# ─── IA Mode Routing Tests ────────────────────────────────────────────────────

class TestIAModeRouting:

    def test_ia_disabled_routes_to_bot(self, supabase_url, supabase_headers, routing_session):
        """When ia_settings.enabled=false, routes to bot."""
        tid = routing_session["tenant_id"]
        _reset_tenant_state(supabase_url, supabase_headers, tid)

        phone = f"5511{uuid.uuid4().hex[:9]}"
        resp = _send_webhook({
            "EventType": "messages",
            "token": routing_session["instance_token"],
            "data": {"sender": f"{phone}@s.whatsapp.net", "text": "oi", "fromMe": False},
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert body.get("routed") in ("bot", None), f"Should route to bot when IA off: {body}"

    def test_ia_enabled_routes_to_n8n_not_bot(self, supabase_url, supabase_headers, routing_session):
        """When ia_settings.enabled=true, routes to n8n, NOT the bot."""
        tid = routing_session["tenant_id"]
        _reset_tenant_state(supabase_url, supabase_headers, tid)
        _set_ia_mode(supabase_url, supabase_headers, tid, True)

        phone = f"5511{uuid.uuid4().hex[:9]}"
        resp = _send_webhook({
            "EventType": "messages",
            "token": routing_session["instance_token"],
            "data": {"sender": f"{phone}@s.whatsapp.net", "text": "oi", "fromMe": False},
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert body.get("routed") == "n8n", f"Should route to n8n when IA enabled: {body}"

    def test_ia_enabled_message_still_logged(self, supabase_url, supabase_headers, routing_session):
        """Even when routing to n8n, inbound message must be logged in DB."""
        tid = routing_session["tenant_id"]
        _reset_tenant_state(supabase_url, supabase_headers, tid)
        _set_ia_mode(supabase_url, supabase_headers, tid, True)

        phone = f"5511{uuid.uuid4().hex[:9]}"
        unique_msg = f"ia-test-{uuid.uuid4().hex[:8]}"
        resp = _send_webhook({
            "EventType": "messages",
            "token": routing_session["instance_token"],
            "data": {"sender": f"{phone}@s.whatsapp.net", "text": unique_msg, "fromMe": False},
        })
        assert resp.status_code == 200
        assert resp.json().get("routed") == "n8n"

        time.sleep(1)
        msg_resp = requests.get(
            f"{supabase_url}/rest/v1/messages?tenant_id=eq.{tid}&content=eq.{unique_msg}",
            headers=supabase_headers,
        )
        assert msg_resp.status_code == 200
        assert len(msg_resp.json()) >= 1, "Message must be logged even when routed to n8n"

    def test_ia_n8n_webhook_uses_session_instance_id(self, supabase_url, supabase_headers, routing_session):
        """Edge function returns the instance_id used for the n8n URL."""
        tid = routing_session["tenant_id"]
        _reset_tenant_state(supabase_url, supabase_headers, tid)
        _set_ia_mode(supabase_url, supabase_headers, tid, True)

        phone = f"5511{uuid.uuid4().hex[:9]}"
        resp = _send_webhook({
            "EventType": "messages",
            "token": routing_session["instance_token"],
            "data": {"sender": f"{phone}@s.whatsapp.net", "text": "test", "fromMe": False},
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("routed") == "n8n"
        # instance field must be set (used to build n8n URL)
        assert body.get("instance"), f"Response must include instance id: {body}"


# ─── Data Isolation Tests ─────────────────────────────────────────────────────

class TestDataIsolation:

    def test_tenant_contacts_isolated_by_tenant_id(self, supabase_url, supabase_headers, routing_session):
        """Contacts created for tenant A must NOT appear when querying with a different tenant_id filter."""
        tid = routing_session["tenant_id"]
        fake_other_tenant_id = str(uuid.uuid4())  # Non-existent tenant

        # Create a contact under the real tenant
        phone = f"5511{uuid.uuid4().hex[:9]}"
        requests.post(
            f"{supabase_url}/rest/v1/contacts",
            headers=supabase_headers,
            json={"tenant_id": tid, "name": "Isolation Test Contact", "phone": phone, "status": "pendente"},
        )

        # Query with a different (fake) tenant_id — must return zero results
        resp = requests.get(
            f"{supabase_url}/rest/v1/contacts?tenant_id=eq.{fake_other_tenant_id}&phone=like.*{phone[-8:]}",
            headers=supabase_headers,
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 0, "Contact must not be visible under a different tenant_id"

        # Cleanup
        requests.delete(
            f"{supabase_url}/rest/v1/contacts?tenant_id=eq.{tid}&phone=like.*{phone[-8:]}",
            headers={**supabase_headers, "Prefer": ""},
        )

    def test_webhook_creates_contact_only_under_correct_tenant(self, supabase_url, supabase_headers, routing_session):
        """Webhook must create contact only under the tenant that owns the session token."""
        tid = routing_session["tenant_id"]
        _reset_tenant_state(supabase_url, supabase_headers, tid)

        phone = f"5511{uuid.uuid4().hex[:9]}"
        resp = _send_webhook({
            "EventType": "messages",
            "token": routing_session["instance_token"],
            "data": {"sender": f"{phone}@s.whatsapp.net", "text": "isolamento", "fromMe": False, "senderName": "Test User"},
        })
        assert resp.status_code == 200
        assert resp.json().get("success") is True

        time.sleep(1)
        # Contact must exist under the correct tenant
        contact_resp = requests.get(
            f"{supabase_url}/rest/v1/contacts?tenant_id=eq.{tid}&phone=like.*{phone[-8:]}&select=tenant_id,phone",
            headers=supabase_headers,
        )
        assert contact_resp.status_code == 200
        contacts = contact_resp.json()
        assert len(contacts) >= 1, "Contact should be created"
        for c in contacts:
            assert c["tenant_id"] == tid, f"Contact must belong to correct tenant: {c}"

    def test_messages_isolated_by_tenant_id(self, supabase_url, supabase_headers, routing_session):
        """Messages logged by tenant A must not appear when filtering by a different tenant_id."""
        tid = routing_session["tenant_id"]
        _reset_tenant_state(supabase_url, supabase_headers, tid)
        fake_other_tenant_id = str(uuid.uuid4())

        phone = f"5511{uuid.uuid4().hex[:9]}"
        unique_msg = f"msg-isolation-{uuid.uuid4().hex[:8]}"
        _send_webhook({
            "EventType": "messages",
            "token": routing_session["instance_token"],
            "data": {"sender": f"{phone}@s.whatsapp.net", "text": unique_msg, "fromMe": False},
        })

        time.sleep(1)
        # Must appear under correct tenant
        r1 = requests.get(
            f"{supabase_url}/rest/v1/messages?tenant_id=eq.{tid}&content=eq.{unique_msg}",
            headers=supabase_headers,
        )
        assert len(r1.json()) >= 1, "Message must be logged under correct tenant"

        # Must NOT appear under fake tenant
        r2 = requests.get(
            f"{supabase_url}/rest/v1/messages?tenant_id=eq.{fake_other_tenant_id}&content=eq.{unique_msg}",
            headers=supabase_headers,
        )
        assert len(r2.json()) == 0, "Message must not appear under different tenant"
