"""
Tests for webhook signature/token validation.
"""
import os
import requests
import pytest
from dotenv import load_dotenv

_env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env.local")
load_dotenv(_env_path)
ASAAS_WEBHOOK_TOKEN = os.getenv("ASAAS_WEBHOOK_ACCESS_TOKEN", "")


class TestAsaasWebhookSecurity:
    """Verify Asaas webhook validates access token."""

    def test_webhook_rejects_without_token(self, app_url):
        """POST /api/webhooks/asaas without token should return 401."""
        resp = requests.post(
            f"{app_url}/api/webhooks/asaas",
            headers={"Content-Type": "application/json"},
            json={
                "event": "PAYMENT_CONFIRMED",
                "payment": {"id": "fake_pay_001", "status": "CONFIRMED", "value": 99.90},
            },
        )
        assert resp.status_code == 401, (
            f"Expected 401 without token, got {resp.status_code}: {resp.text}"
        )

    def test_webhook_rejects_wrong_token(self, app_url):
        """POST /api/webhooks/asaas with wrong token should return 401."""
        resp = requests.post(
            f"{app_url}/api/webhooks/asaas",
            headers={
                "Content-Type": "application/json",
                "asaas-access-token": "totally-wrong-token",
            },
            json={
                "event": "PAYMENT_CONFIRMED",
                "payment": {"id": "fake_pay_002", "status": "CONFIRMED", "value": 99.90},
            },
        )
        assert resp.status_code == 401, (
            f"Expected 401 with wrong token, got {resp.status_code}: {resp.text}"
        )

    def test_webhook_accepts_valid_token(self, app_url):
        """POST /api/webhooks/asaas with correct token should return 200."""
        assert ASAAS_WEBHOOK_TOKEN, "ASAAS_WEBHOOK_ACCESS_TOKEN not found in .env.local"
        resp = requests.post(
            f"{app_url}/api/webhooks/asaas",
            headers={
                "Content-Type": "application/json",
                "asaas-access-token": ASAAS_WEBHOOK_TOKEN,
            },
            json={
                "id": "evt_webhook_security_test",
                "event": "PAYMENT_CONFIRMED",
                "payment": {
                    "id": "fake_pay_003",
                    "status": "CONFIRMED",
                    "value": 99.90,
                    "externalReference": None,
                },
            },
        )
        assert resp.status_code == 200, (
            f"Expected 200 with valid token, got {resp.status_code}: {resp.text}"
        )
        body = resp.json()
        assert body.get("success") is True
