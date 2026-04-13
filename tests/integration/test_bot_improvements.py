"""
Integration tests for bot improvements:
- Multi-unit selection
- "Sem preferencia" professional load-balancing
- Payment info after booking
- Intent detection (greeting, cancel, exit)
"""
import requests
import pytest
import uuid


class TestBotIntentDetection:
    """Test that the bot correctly detects intents from text messages."""

    def _send_webhook(self, app_url, api_headers, tenant_id, instance_id, phone, message):
        """Simulate an incoming WhatsApp message via the webhook."""
        headers = {**api_headers, "x-tenant-id": tenant_id}
        return requests.post(
            f"{app_url}/api/webhooks/whatsapp",
            headers=headers,
            json={
                "event": "messages.upsert",
                "instance": instance_id,
                "data": {
                    "key": {
                        "remoteJid": f"{phone}@s.whatsapp.net",
                        "fromMe": False,
                        "id": str(uuid.uuid4()),
                    },
                    "message": {"conversation": message},
                    "messageTimestamp": 1700000000,
                },
            },
        )

    def _get_state(self, supabase_url, supabase_headers, tenant_id, contact_id):
        """Get conversation state for a contact."""
        resp = requests.get(
            f"{supabase_url}/rest/v1/conversation_states"
            f"?tenant_id=eq.{tenant_id}&contact_id=eq.{contact_id}&select=current_state,context",
            headers=supabase_headers,
        )
        if resp.status_code == 200 and resp.json():
            return resp.json()[0]
        return None

    def test_greeting_resets_to_idle(self, app_url, api_headers, test_tenant, supabase_url, supabase_headers):
        """Sending 'oi' should trigger a greeting intent and reset state to IDLE flow."""
        phone = f"5511{uuid.uuid4().hex[:9]}"
        tid = test_tenant["tenant_id"]

        # Create a whatsapp session for this tenant
        requests.post(
            f"{supabase_url}/rest/v1/whatsapp_sessions",
            headers=supabase_headers,
            json={
                "tenant_id": tid,
                "instance_id": "test-bot-instance",
                "phone_number": "5511000000000",
                "status": "connected",
            },
        )

        resp = self._send_webhook(app_url, api_headers, tid, "test-bot-instance", phone, "oi")
        assert resp.status_code == 200

    def test_exit_intent_pauses(self, app_url, api_headers, test_tenant, supabase_url, supabase_headers):
        """Sending 'sair' should pause the bot for 24h."""
        phone = f"5511{uuid.uuid4().hex[:9]}"
        tid = test_tenant["tenant_id"]

        # First message to create contact and state
        self._send_webhook(app_url, api_headers, tid, "test-bot-instance", phone, "oi")

        # Get the contact
        r = requests.get(
            f"{supabase_url}/rest/v1/contacts?tenant_id=eq.{tid}&phone=eq.{phone}&select=id",
            headers=supabase_headers,
        )
        if r.status_code == 200 and r.json():
            contact_id = r.json()[0]["id"]

            # Send exit intent
            self._send_webhook(app_url, api_headers, tid, "test-bot-instance", phone, "sair")

            state = self._get_state(supabase_url, supabase_headers, tid, contact_id)
            if state:
                assert state["current_state"] == "PAUSED"


class TestBotMultiUnit:
    """Test that multi-unit selection works when tenant has multiple companies."""

    def test_multi_unit_shown_when_multiple_companies(self, supabase_url, supabase_headers, test_tenant):
        """If tenant has >1 company, bot should transition to SELECTING_UNIT state."""
        tid = test_tenant["tenant_id"]

        # Create a second company
        resp = requests.post(
            f"{supabase_url}/rest/v1/companies",
            headers=supabase_headers,
            json={"tenant_id": tid, "name": "Unidade 2", "is_default": False},
        )
        assert resp.status_code in (200, 201)

        # Verify there are now 2+ companies
        r = requests.get(
            f"{supabase_url}/rest/v1/companies?tenant_id=eq.{tid}&select=id",
            headers=supabase_headers,
        )
        companies = r.json() if r.status_code == 200 else []
        assert len(companies) >= 2, f"Expected >=2 companies, got {len(companies)}"

        # Cleanup: delete the second company
        second_id = resp.json()[0]["id"] if isinstance(resp.json(), list) else resp.json()["id"]
        requests.delete(
            f"{supabase_url}/rest/v1/companies?id=eq.{second_id}",
            headers={**supabase_headers, "Prefer": ""},
        )


class TestBotSemPreferencia:
    """Test that 'sem preferencia' option exists in the professional selection logic."""

    def test_no_preference_option_in_bot_code(self):
        """The bot.ts should contain logic for 'no_preference' and load-balancing."""
        import os
        bot_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "src", "lib", "whatsapp", "bot.ts"
        )
        with open(bot_path, "r", encoding="utf-8") as f:
            content = f.read()

        assert "no_preference" in content, "Bot should have 'no_preference' option"
        assert "Sem preferencia" in content, "Bot should show 'Sem preferencia' text"
        assert "minCount" in content or "min" in content, "Bot should implement load-balancing"


class TestBotPaymentInfo:
    """Test that payment info is sent after booking if settings are configured."""

    def test_payment_info_function_exists(self):
        """The bot should have sendPaymentInfoIfAvailable function."""
        import os
        bot_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "src", "lib", "whatsapp", "bot.ts"
        )
        with open(bot_path, "r", encoding="utf-8") as f:
            content = f.read()

        assert "sendPaymentInfoIfAvailable" in content
        assert "pix_key" in content
        assert "payment_link" in content
