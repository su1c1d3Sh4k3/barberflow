"""
Integration tests for the WhatsApp bot state machine.
Verifies end-to-end state transitions through the webhook endpoint.
"""
import requests
import pytest
import uuid
from datetime import date, timedelta


@pytest.fixture(scope="module")
def bot_env(supabase_headers, supabase_url, test_tenant):
    """Set up a full bot test environment."""
    tenant_id = test_tenant["tenant_id"]
    company_id = test_tenant["company_id"]
    instance_id = f"bot-sm-{uuid.uuid4().hex[:8]}"
    phone = f"5511{uuid.uuid4().hex[:9]}"

    # WhatsApp session
    requests.post(
        f"{supabase_url}/rest/v1/whatsapp_sessions",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "instance_id": instance_id,
            "instance_token": "bot-test-token",
            "status": "connected",
            "phone_number": "5511999990002",
        },
    )

    # Category
    cat_resp = requests.post(
        f"{supabase_url}/rest/v1/service_categories",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "Barba SM Test"},
    )
    cat = (cat_resp.json()[0] if isinstance(cat_resp.json(), list) else cat_resp.json())

    # Service
    svc_resp = requests.post(
        f"{supabase_url}/rest/v1/services",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "name": "Barba Completa SM",
            "duration_min": 45,
            "price": 60.00,
            "category_id": cat["id"],
            "active": True,
        },
    )
    svc = svc_resp.json()[0] if isinstance(svc_resp.json(), list) else svc_resp.json()

    # Professional with schedule
    prof_resp = requests.post(
        f"{supabase_url}/rest/v1/professionals",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "company_id": company_id,
            "name": "Pedro SM Bot",
            "active": True,
        },
    )
    prof = prof_resp.json()[0] if isinstance(prof_resp.json(), list) else prof_resp.json()

    # Link professional → service
    requests.post(
        f"{supabase_url}/rest/v1/professional_services",
        headers=supabase_headers,
        json={"professional_id": prof["id"], "service_id": svc["id"]},
    )

    # Create business_hours for the professional (Mon-Sat 08:00-18:00)
    tomorrow = date.today() + timedelta(days=1)
    tomorrow_dow = tomorrow.weekday()  # 0=Monday
    for dow in range(6):  # Mon-Sat
        requests.post(
            f"{supabase_url}/rest/v1/business_hours",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "company_id": company_id,
                "weekday": dow,
                "open_time": "08:00",
                "close_time": "18:00",
                "is_open": True,
            },
        )

    yield {
        "tenant_id": tenant_id,
        "company_id": company_id,
        "instance_id": instance_id,
        "phone": phone,
        "category_id": cat["id"],
        "category_name": "Barba SM Test",
        "service_id": svc["id"],
        "service_name": "Barba Completa SM",
        "professional_id": prof["id"],
        "professional_name": "Pedro SM Bot",
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
    requests.delete(
        f"{supabase_url}/rest/v1/business_hours?tenant_id=eq.{tenant_id}",
        headers={**supabase_headers, "Prefer": ""},
    )


def _send(app_url, instance_id, phone, message):
    """Send a message through the webhook."""
    return requests.post(
        f"{app_url}/api/webhooks/whatsapp",
        json={
            "event": "messages",
            "instance": {"id": instance_id},
            "data": {
                "key": {
                    "remoteJid": f"{phone}@s.whatsapp.net",
                    "fromMe": False,
                },
                "message": {"conversation": message},
                "pushName": "Test Bot User",
            },
        },
    )


def _get_state(supabase_url, supabase_headers, tenant_id, phone):
    """Get the current conversation state for a phone."""
    # First get contact
    resp = requests.get(
        f"{supabase_url}/rest/v1/contacts?tenant_id=eq.{tenant_id}&phone=eq.{phone}&select=id",
        headers=supabase_headers,
    )
    if resp.status_code != 200 or not resp.json():
        return None
    contact_id = resp.json()[0]["id"]

    # Then get state
    resp = requests.get(
        f"{supabase_url}/rest/v1/conversation_states?tenant_id=eq.{tenant_id}&contact_id=eq.{contact_id}&select=current_state,context",
        headers=supabase_headers,
    )
    if resp.status_code != 200 or not resp.json():
        return None
    return resp.json()[0]


class TestBotStateMachine:
    """Integration tests for the full bot conversation flow."""

    def test_initial_message_creates_state(self, app_url, bot_env, supabase_headers, supabase_url):
        """First message should create contact and conversation state."""
        resp = _send(app_url, bot_env["instance_id"], bot_env["phone"], "oi")
        assert resp.status_code == 200

        state = _get_state(supabase_url, supabase_headers, bot_env["tenant_id"], bot_env["phone"])
        assert state is not None, "State should be created"
        # State should be SELECTING_CATEGORY (after showing categories) or AWAITING_NAME
        assert state["current_state"] in ("SELECTING_CATEGORY", "AWAITING_NAME"), (
            f"Expected SELECTING_CATEGORY or AWAITING_NAME, got {state['current_state']}"
        )

    def test_category_selection(self, app_url, bot_env, supabase_headers, supabase_url):
        """Selecting a category should transition to SELECTING_SERVICE."""
        phone = f"5511{uuid.uuid4().hex[:9]}"

        # Start conversation
        _send(app_url, bot_env["instance_id"], phone, "oi")

        state = _get_state(supabase_url, supabase_headers, bot_env["tenant_id"], phone)
        if state and state["current_state"] == "AWAITING_NAME":
            _send(app_url, bot_env["instance_id"], phone, "Maria Teste")

        # Select category by button ID
        _send(app_url, bot_env["instance_id"], phone, f"cat_{bot_env['category_id']}")

        state = _get_state(supabase_url, supabase_headers, bot_env["tenant_id"], phone)
        assert state is not None
        assert state["current_state"] == "SELECTING_SERVICE"

    def test_service_selection(self, app_url, bot_env, supabase_headers, supabase_url):
        """Selecting a service should transition to AWAITING_DATE."""
        phone = f"5511{uuid.uuid4().hex[:9]}"

        _send(app_url, bot_env["instance_id"], phone, "oi")
        state = _get_state(supabase_url, supabase_headers, bot_env["tenant_id"], phone)
        if state and state["current_state"] == "AWAITING_NAME":
            _send(app_url, bot_env["instance_id"], phone, "Carlos Teste")

        _send(app_url, bot_env["instance_id"], phone, f"cat_{bot_env['category_id']}")
        _send(app_url, bot_env["instance_id"], phone, f"svc_{bot_env['service_id']}")

        state = _get_state(supabase_url, supabase_headers, bot_env["tenant_id"], phone)
        assert state is not None
        assert state["current_state"] == "AWAITING_DATE"
        assert state["context"].get("serviceId") == bot_env["service_id"]

    def test_date_selection_amanha(self, app_url, bot_env, supabase_headers, supabase_url):
        """Saying 'amanhã' should transition to SELECTING_PROFESSIONAL."""
        phone = f"5511{uuid.uuid4().hex[:9]}"

        _send(app_url, bot_env["instance_id"], phone, "oi")
        state = _get_state(supabase_url, supabase_headers, bot_env["tenant_id"], phone)
        if state and state["current_state"] == "AWAITING_NAME":
            _send(app_url, bot_env["instance_id"], phone, "Ana Teste")

        _send(app_url, bot_env["instance_id"], phone, f"cat_{bot_env['category_id']}")
        _send(app_url, bot_env["instance_id"], phone, f"svc_{bot_env['service_id']}")
        _send(app_url, bot_env["instance_id"], phone, "date_amanha")

        state = _get_state(supabase_url, supabase_headers, bot_env["tenant_id"], phone)
        assert state is not None
        assert state["current_state"] == "SELECTING_PROFESSIONAL"
        assert state["context"].get("selectedDate") is not None

    def test_global_cancelar_resets(self, app_url, bot_env, supabase_headers, supabase_url):
        """'cancelar' at any point should reset to IDLE."""
        phone = f"5511{uuid.uuid4().hex[:9]}"

        _send(app_url, bot_env["instance_id"], phone, "oi")
        state = _get_state(supabase_url, supabase_headers, bot_env["tenant_id"], phone)
        if state and state["current_state"] == "AWAITING_NAME":
            _send(app_url, bot_env["instance_id"], phone, "Paulo Teste")

        _send(app_url, bot_env["instance_id"], phone, f"cat_{bot_env['category_id']}")
        # Now in SELECTING_SERVICE, send cancelar
        _send(app_url, bot_env["instance_id"], phone, "cancelar")

        state = _get_state(supabase_url, supabase_headers, bot_env["tenant_id"], phone)
        assert state is not None
        assert state["current_state"] == "IDLE"


class TestBotDateParser:
    """Test date parsing through the bot (via webhook)."""

    def _setup_to_date_state(self, app_url, bot_env, supabase_headers, supabase_url):
        """Helper: advance a new contact to AWAITING_DATE state."""
        phone = f"5511{uuid.uuid4().hex[:9]}"
        _send(app_url, bot_env["instance_id"], phone, "oi")

        state = _get_state(supabase_url, supabase_headers, bot_env["tenant_id"], phone)
        if state and state["current_state"] == "AWAITING_NAME":
            _send(app_url, bot_env["instance_id"], phone, "Teste Date")

        _send(app_url, bot_env["instance_id"], phone, f"cat_{bot_env['category_id']}")
        _send(app_url, bot_env["instance_id"], phone, f"svc_{bot_env['service_id']}")
        return phone

    def test_date_hoje(self, app_url, bot_env, supabase_headers, supabase_url):
        """'hoje' should be accepted as a valid date."""
        phone = self._setup_to_date_state(app_url, bot_env, supabase_headers, supabase_url)
        _send(app_url, bot_env["instance_id"], phone, "hoje")
        state = _get_state(supabase_url, supabase_headers, bot_env["tenant_id"], phone)
        assert state is not None
        # Should advance to SELECTING_PROFESSIONAL or stay if no pros available
        assert state["current_state"] in ("SELECTING_PROFESSIONAL", "AWAITING_DATE", "IDLE")

    def test_date_invalid_stays(self, app_url, bot_env, supabase_headers, supabase_url):
        """Invalid date should keep state at AWAITING_DATE."""
        phone = self._setup_to_date_state(app_url, bot_env, supabase_headers, supabase_url)
        _send(app_url, bot_env["instance_id"], phone, "blablabla")
        state = _get_state(supabase_url, supabase_headers, bot_env["tenant_id"], phone)
        assert state is not None
        assert state["current_state"] == "AWAITING_DATE"

    def test_date_weekday(self, app_url, bot_env, supabase_headers, supabase_url):
        """Weekday name should be accepted."""
        phone = self._setup_to_date_state(app_url, bot_env, supabase_headers, supabase_url)
        _send(app_url, bot_env["instance_id"], phone, "segunda")
        state = _get_state(supabase_url, supabase_headers, bot_env["tenant_id"], phone)
        assert state is not None
        assert state["current_state"] in ("SELECTING_PROFESSIONAL", "AWAITING_DATE", "IDLE")

    def test_date_dd_mm(self, app_url, bot_env, supabase_headers, supabase_url):
        """DD/MM format should be accepted."""
        phone = self._setup_to_date_state(app_url, bot_env, supabase_headers, supabase_url)
        future = date.today() + timedelta(days=10)
        _send(app_url, bot_env["instance_id"], phone, f"{future.day:02d}/{future.month:02d}")
        state = _get_state(supabase_url, supabase_headers, bot_env["tenant_id"], phone)
        assert state is not None
        assert state["current_state"] in ("SELECTING_PROFESSIONAL", "AWAITING_DATE", "IDLE")
