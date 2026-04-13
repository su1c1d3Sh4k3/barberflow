"""
Tests for hardened Asaas webhook security:
- Mandatory token validation (timing-safe)
- Replay protection (rejects events older than 5 minutes)
"""
import os
import requests
import pytest
import uuid
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

_env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env.local")
load_dotenv(_env_path)
ASAAS_WEBHOOK_TOKEN = os.getenv("ASAAS_WEBHOOK_ACCESS_TOKEN", "")


class TestAsaasWebhookTokenMandatory:
    """Token validation is now mandatory — must fail if missing or wrong."""

    def test_rejects_no_token(self, app_url):
        """No asaas-access-token header → 401."""
        resp = requests.post(
            f"{app_url}/api/webhooks/asaas",
            headers={"Content-Type": "application/json"},
            json={"event": "PAYMENT_CONFIRMED", "payment": {"id": "p1"}},
        )
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"

    def test_rejects_wrong_token(self, app_url):
        """Wrong token → 401."""
        resp = requests.post(
            f"{app_url}/api/webhooks/asaas",
            headers={
                "Content-Type": "application/json",
                "asaas-access-token": "wrong-token-value",
            },
            json={"event": "PAYMENT_CONFIRMED", "payment": {"id": "p2"}},
        )
        assert resp.status_code == 401

    def test_rejects_empty_token(self, app_url):
        """Empty token → 401."""
        resp = requests.post(
            f"{app_url}/api/webhooks/asaas",
            headers={
                "Content-Type": "application/json",
                "asaas-access-token": "",
            },
            json={"event": "PAYMENT_CONFIRMED", "payment": {"id": "p3"}},
        )
        assert resp.status_code == 401

    def test_accepts_valid_token(self, app_url):
        """Correct token → 200."""
        assert ASAAS_WEBHOOK_TOKEN, "ASAAS_WEBHOOK_ACCESS_TOKEN not in .env.local"
        resp = requests.post(
            f"{app_url}/api/webhooks/asaas",
            headers={
                "Content-Type": "application/json",
                "asaas-access-token": ASAAS_WEBHOOK_TOKEN,
            },
            json={
                "id": f"evt_token_test_{uuid.uuid4().hex[:8]}",
                "event": "PAYMENT_CONFIRMED",
                "payment": {"id": "pay_tok_1", "status": "CONFIRMED"},
            },
        )
        assert resp.status_code == 200
        assert resp.json().get("success") is True


class TestAsaasReplayProtection:
    """Events with dateCreated older than 5 minutes should be rejected."""

    def _headers(self):
        return {
            "Content-Type": "application/json",
            "asaas-access-token": ASAAS_WEBHOOK_TOKEN,
        }

    def test_rejects_old_event(self, app_url):
        """Event with dateCreated 10 minutes ago → 400."""
        assert ASAAS_WEBHOOK_TOKEN, "ASAAS_WEBHOOK_ACCESS_TOKEN not in .env.local"
        old_time = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        resp = requests.post(
            f"{app_url}/api/webhooks/asaas",
            headers=self._headers(),
            json={
                "id": f"evt_replay_{uuid.uuid4().hex[:8]}",
                "event": "PAYMENT_CONFIRMED",
                "dateCreated": old_time,
                "payment": {"id": "pay_old_1", "status": "CONFIRMED"},
            },
        )
        assert resp.status_code == 400, f"Expected 400 for stale event, got {resp.status_code}"
        assert "expired" in resp.json().get("error", "").lower()

    def test_accepts_recent_event(self, app_url):
        """Event with dateCreated 1 minute ago → 200."""
        assert ASAAS_WEBHOOK_TOKEN, "ASAAS_WEBHOOK_ACCESS_TOKEN not in .env.local"
        recent_time = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        resp = requests.post(
            f"{app_url}/api/webhooks/asaas",
            headers=self._headers(),
            json={
                "id": f"evt_recent_{uuid.uuid4().hex[:8]}",
                "event": "PAYMENT_RECEIVED",
                "dateCreated": recent_time,
                "payment": {"id": "pay_recent_1", "status": "RECEIVED"},
            },
        )
        assert resp.status_code == 200

    def test_accepts_event_without_date(self, app_url):
        """Event without dateCreated → still accepted (backwards compatible)."""
        assert ASAAS_WEBHOOK_TOKEN, "ASAAS_WEBHOOK_ACCESS_TOKEN not in .env.local"
        resp = requests.post(
            f"{app_url}/api/webhooks/asaas",
            headers=self._headers(),
            json={
                "id": f"evt_nodate_{uuid.uuid4().hex[:8]}",
                "event": "PAYMENT_CONFIRMED",
                "payment": {"id": "pay_nodate_1", "status": "CONFIRMED"},
            },
        )
        assert resp.status_code == 200
