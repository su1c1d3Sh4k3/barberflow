"""
Tests for /api/webhooks endpoints.
"""
import os
import requests
import pytest
import uuid
from dotenv import load_dotenv

_env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env.local")
load_dotenv(_env_path)
ASAAS_WEBHOOK_TOKEN = os.getenv("ASAAS_WEBHOOK_ACCESS_TOKEN", "")


class TestWebhooksAPI:
    """Webhook receiver endpoints."""

    def test_whatsapp_webhook_receives(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        payload = {
            "event": "messages.upsert",
            "instance": "test-instance",
            "data": {
                "key": {
                    "remoteJid": "5511988884001@s.whatsapp.net",
                    "fromMe": False,
                    "id": str(uuid.uuid4()),
                },
                "message": {"conversation": "Olá, quero agendar"},
                "messageTimestamp": 1700000000,
            },
        }
        resp = requests.post(
            f"{app_url}/api/webhooks/whatsapp", headers=headers, json=payload
        )
        assert resp.status_code == 200

    def test_asaas_webhook_receives(self, app_url, api_headers, test_tenant):
        headers = {
            **api_headers,
            "x-tenant-id": test_tenant["tenant_id"],
            "asaas-access-token": ASAAS_WEBHOOK_TOKEN,
        }
        event_id = str(uuid.uuid4())
        payload = {
            "event": "PAYMENT_RECEIVED",
            "payment": {
                "id": f"pay_{event_id[:8]}",
                "customer": "cus_test123",
                "value": 45.00,
                "status": "RECEIVED",
            },
        }
        resp = requests.post(
            f"{app_url}/api/webhooks/asaas", headers=headers, json=payload
        )
        assert resp.status_code == 200

    def test_asaas_idempotency(self, app_url, api_headers, test_tenant):
        headers = {
            **api_headers,
            "x-tenant-id": test_tenant["tenant_id"],
            "asaas-access-token": ASAAS_WEBHOOK_TOKEN,
        }
        event_id = str(uuid.uuid4())
        payload = {
            "event": "PAYMENT_CONFIRMED",
            "payment": {
                "id": f"pay_{event_id[:8]}",
                "customer": "cus_test456",
                "value": 60.00,
                "status": "CONFIRMED",
            },
        }
        # Send same event twice
        resp1 = requests.post(
            f"{app_url}/api/webhooks/asaas", headers=headers, json=payload
        )
        resp2 = requests.post(
            f"{app_url}/api/webhooks/asaas", headers=headers, json=payload
        )
        assert resp1.status_code == 200
        assert resp2.status_code == 200
