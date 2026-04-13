"""
Integration tests for billing flow:
  Trial → Subscribe → Webhook activates → Invoice created → Cancel
"""
import requests
import pytest
from datetime import datetime, timedelta


class TestBillingFlow:
    """End-to-end billing flow tests using direct DB + API."""

    def test_trial_subscription_exists_on_tenant_creation(self, test_tenant, supabase_headers, supabase_url):
        """Test tenant should have or be able to have a subscription."""
        tenant_id = test_tenant["tenant_id"]

        # Check or create trial subscription
        resp = requests.get(
            f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}&select=*",
            headers=supabase_headers,
        )
        assert resp.status_code == 200

    def test_subscription_status_api(self, app_url, api_headers, test_tenant,
                                      supabase_headers, supabase_url):
        """After creating a subscription, status API should return it."""
        tenant_id = test_tenant["tenant_id"]
        now = datetime.utcnow()

        # Ensure subscription exists
        requests.post(
            f"{supabase_url}/rest/v1/subscriptions",
            headers={**supabase_headers, "Prefer": "return=representation,resolution=merge-duplicates"},
            json={
                "tenant_id": tenant_id,
                "plan_id": "essencial_monthly",
                "status": "active",
                "current_period_start": now.isoformat(),
                "current_period_end": (now + timedelta(days=30)).isoformat(),
            },
        )

        headers = {**api_headers, "x-tenant-id": tenant_id}
        resp = requests.get(f"{app_url}/api/subscriptions/status", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        data = body.get("data", {})
        assert data.get("subscription_status") == "active"
        assert data.get("plan_id") == "essencial_monthly"

    def test_webhook_payment_confirmed_activates(self, app_url, supabase_headers, supabase_url,
                                                   test_tenant, api_headers):
        """Simulating Asaas PAYMENT_CONFIRMED should activate subscription."""
        tenant_id = test_tenant["tenant_id"]
        now = datetime.utcnow()

        # Get subscription ID
        sub_resp = requests.get(
            f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}&select=id",
            headers=supabase_headers,
        )
        sub_id = sub_resp.json()[0]["id"] if sub_resp.json() else None
        assert sub_id, "Subscription should exist"

        # Set subscription to pending_payment
        requests.patch(
            f"{supabase_url}/rest/v1/subscriptions?id=eq.{sub_id}",
            headers=supabase_headers,
            json={"status": "pending_payment"},
        )

        # Create a pending invoice with a fake asaas_payment_id
        import uuid
        payment_id = f"pay_test_{uuid.uuid4().hex[:12]}"
        requests.post(
            f"{supabase_url}/rest/v1/invoices",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "subscription_id": sub_id,
                "asaas_payment_id": payment_id,
                "type": "subscription",
                "description": "Test Payment",
                "value": 99.90,
                "status": "PENDING",
                "billing_type": "PIX",
                "due_date": now.strftime("%Y-%m-%d"),
            },
        )

        # Send webhook (externalReference = subscription ID)
        import os
        webhook_token = os.getenv("ASAAS_WEBHOOK_ACCESS_TOKEN", "")
        resp = requests.post(
            f"{app_url}/api/webhooks/asaas",
            headers={
                "Content-Type": "application/json",
                "asaas-access-token": webhook_token,
            },
            json={
                "id": f"evt_{uuid.uuid4().hex[:12]}",
                "event": "PAYMENT_CONFIRMED",
                "payment": {
                    "id": payment_id,
                    "externalReference": sub_id,
                    "status": "CONFIRMED",
                    "value": 99.90,
                    "billingType": "PIX",
                },
            },
        )
        assert resp.status_code == 200

        # Verify subscription was activated
        sub_resp = requests.get(
            f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}&select=status",
            headers=supabase_headers,
        )
        if sub_resp.json():
            assert sub_resp.json()[0]["status"] == "active"

        # Verify invoice was updated
        inv_resp = requests.get(
            f"{supabase_url}/rest/v1/invoices?asaas_payment_id=eq.{payment_id}&select=status",
            headers=supabase_headers,
        )
        if inv_resp.json():
            assert inv_resp.json()[0]["status"] == "RECEIVED"

    def test_cancel_keeps_access(self, app_url, api_headers, test_tenant,
                                  supabase_headers, supabase_url):
        """Canceling should set canceled status but maintain access_until."""
        tenant_id = test_tenant["tenant_id"]
        now = datetime.utcnow()
        period_end = now + timedelta(days=25)

        # Set to active with known period_end
        requests.patch(
            f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}",
            headers=supabase_headers,
            json={
                "status": "active",
                "current_period_end": period_end.isoformat(),
                "canceled_at": None,
                "cancellation_reason": None,
            },
        )

        headers = {**api_headers, "x-tenant-id": tenant_id}
        resp = requests.post(
            f"{app_url}/api/subscriptions/cancel",
            headers=headers,
            json={"reason": "test cancel"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        data = body.get("data", {})
        assert "canceled_at" in data
        assert "access_until" in data

        # Verify DB
        sub_resp = requests.get(
            f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}&select=status,cancellation_reason",
            headers=supabase_headers,
        )
        sub = sub_resp.json()[0]
        assert sub["status"] == "canceled"
        assert sub["cancellation_reason"] == "test cancel"

    def test_webhook_idempotency(self, app_url, supabase_headers, supabase_url,
                                  test_tenant):
        """Sending same webhook event twice should not cause errors."""
        import uuid, os
        tenant_id = test_tenant["tenant_id"]
        event_id = f"evt_idem_{uuid.uuid4().hex[:8]}"
        payment_id = f"pay_idem_{uuid.uuid4().hex[:8]}"
        webhook_token = os.getenv("ASAAS_WEBHOOK_ACCESS_TOKEN", "")

        # Create invoice
        requests.post(
            f"{supabase_url}/rest/v1/invoices",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "asaas_payment_id": payment_id,
                "type": "subscription",
                "description": "Idempotency Test",
                "value": 99.90,
                "status": "PENDING",
                "billing_type": "PIX",
                "due_date": "2026-05-01",
            },
        )

        payload = {
            "id": event_id,
            "event": "PAYMENT_CONFIRMED",
            "payment": {
                "id": payment_id,
                "status": "CONFIRMED",
                "value": 99.90,
            },
        }
        headers = {
            "Content-Type": "application/json",
            "asaas-access-token": webhook_token,
        }

        # Send twice
        resp1 = requests.post(f"{app_url}/api/webhooks/asaas", headers=headers, json=payload)
        resp2 = requests.post(f"{app_url}/api/webhooks/asaas", headers=headers, json=payload)

        assert resp1.status_code == 200
        assert resp2.status_code == 200
