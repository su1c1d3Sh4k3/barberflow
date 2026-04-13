"""
End-to-end subscription flow tests.
"""
import os
import uuid
import requests
import pytest
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

_env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env.local")
load_dotenv(_env_path)
CRON_SECRET = os.getenv("CRON_SECRET", "")


class TestSubscriptionFlow:
    """Integration tests for full subscription lifecycle."""

    def _cron_headers(self):
        return {
            "Content-Type": "application/json",
            "x-cron-secret": CRON_SECRET,
        }

    def test_trial_to_expired_flow(self, app_url, supabase_url, supabase_headers, test_tenant):
        """
        Create tenant with trial subscription -> verify active trial ->
        set trial_ends_at to past -> call expire cron -> verify status=expired.
        """
        assert CRON_SECRET, "CRON_SECRET not found in .env.local"
        tenant_id = test_tenant["tenant_id"]
        future = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()

        # Step 1: Create trial subscription with future expiry
        requests.delete(
            f"{supabase_url}/rest/v1/invoices?tenant_id=eq.{tenant_id}",
            headers={**supabase_headers, "Prefer": ""},
        )
        requests.delete(
            f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}",
            headers={**supabase_headers, "Prefer": ""},
        )
        resp = requests.post(
            f"{supabase_url}/rest/v1/subscriptions",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "status": "trial",
                "trial_ends_at": future,
                "plan_id": None,
            },
        )
        assert resp.status_code in (200, 201), f"Failed to create subscription: {resp.text}"
        sub = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
        sub_id = sub["id"]

        try:
            # Step 2: Verify it is a trial
            check = requests.get(
                f"{supabase_url}/rest/v1/subscriptions?id=eq.{sub_id}",
                headers=supabase_headers,
            )
            assert check.json()[0]["status"] == "trial", "Initial status should be 'trial'"

            # Step 3: Update trial_ends_at to the past
            past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
            patch_resp = requests.patch(
                f"{supabase_url}/rest/v1/subscriptions?id=eq.{sub_id}",
                headers=supabase_headers,
                json={"trial_ends_at": past},
            )
            assert patch_resp.status_code in (200, 204), (
                f"Failed to update trial_ends_at: {patch_resp.text}"
            )

            # Step 4: Call expire-trials cron
            cron_resp = requests.post(
                f"{app_url}/api/cron/expire-trials",
                headers=self._cron_headers(),
            )
            assert cron_resp.status_code == 200, (
                f"Cron failed: {cron_resp.status_code} {cron_resp.text}"
            )

            # Step 5: Verify status = expired
            final = requests.get(
                f"{supabase_url}/rest/v1/subscriptions?id=eq.{sub_id}",
                headers=supabase_headers,
            )
            assert final.json()[0]["status"] == "expired", (
                f"Expected 'expired' after cron, got '{final.json()[0]['status']}'"
            )
        finally:
            requests.delete(
                f"{supabase_url}/rest/v1/subscriptions?id=eq.{sub_id}",
                headers={**supabase_headers, "Prefer": ""},
            )

    def test_webhook_payment_activates(self, app_url, supabase_url, supabase_headers, api_headers, test_tenant):
        """
        Create subscription with pending_payment ->
        send Asaas PAYMENT_RECEIVED webhook ->
        verify status=active.
        """
        tenant_id = test_tenant["tenant_id"]

        # Step 1: Create subscription with pending_payment status
        requests.delete(
            f"{supabase_url}/rest/v1/invoices?tenant_id=eq.{tenant_id}",
            headers={**supabase_headers, "Prefer": ""},
        )
        requests.delete(
            f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}",
            headers={**supabase_headers, "Prefer": ""},
        )
        resp = requests.post(
            f"{supabase_url}/rest/v1/subscriptions",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "status": "pending_payment",
                "plan_id": None,
                "current_period_start": datetime.now(timezone.utc).isoformat(),
                "current_period_end": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
            },
        )
        assert resp.status_code in (200, 201), f"Failed to create subscription: {resp.text}"
        sub = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
        sub_id = sub["id"]

        # Create matching invoice
        payment_id = f"pay_test_{uuid.uuid4().hex[:8]}"
        inv_resp = requests.post(
            f"{supabase_url}/rest/v1/invoices",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "subscription_id": sub_id,
                "asaas_payment_id": payment_id,
                "type": "subscription",
                "description": "Test Plan",
                "value": 49.90,
                "status": "PENDING",
                "billing_type": "PIX",
                "due_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            },
        )
        assert inv_resp.status_code in (200, 201), f"Failed to create invoice: {inv_resp.text}"
        inv = inv_resp.json()[0] if isinstance(inv_resp.json(), list) else inv_resp.json()

        try:
            # Step 2: Verify initial status
            check = requests.get(
                f"{supabase_url}/rest/v1/subscriptions?id=eq.{sub_id}",
                headers=supabase_headers,
            )
            assert check.json()[0]["status"] == "pending_payment", (
                "Initial status should be 'pending_payment'"
            )

            # Step 3: Send Asaas PAYMENT_RECEIVED webhook
            webhook_headers = {**api_headers, "x-tenant-id": tenant_id, "asaas-access-token": os.getenv("ASAAS_WEBHOOK_ACCESS_TOKEN", "")}
            webhook_payload = {
                "event": "PAYMENT_RECEIVED",
                "payment": {
                    "id": payment_id,
                    "customer": "cus_test_flow",
                    "value": 49.90,
                    "status": "RECEIVED",
                    "externalReference": sub_id,
                },
            }
            wh_resp = requests.post(
                f"{app_url}/api/webhooks/asaas",
                headers=webhook_headers,
                json=webhook_payload,
            )
            assert wh_resp.status_code == 200, (
                f"Webhook call failed: {wh_resp.status_code} {wh_resp.text}"
            )

            # Step 4: Verify status = active
            final = requests.get(
                f"{supabase_url}/rest/v1/subscriptions?id=eq.{sub_id}",
                headers=supabase_headers,
            )
            assert final.json()[0]["status"] == "active", (
                f"Expected 'active' after payment webhook, got '{final.json()[0]['status']}'"
            )

            # Step 5: Verify invoice is marked as received
            inv_check = requests.get(
                f"{supabase_url}/rest/v1/invoices?asaas_payment_id=eq.{payment_id}",
                headers=supabase_headers,
            )
            assert inv_check.json()[0]["status"] == "RECEIVED", (
                f"Invoice should be 'RECEIVED', got '{inv_check.json()[0]['status']}'"
            )
        finally:
            # Cleanup: webhook events, invoices, subscriptions
            requests.delete(
                f"{supabase_url}/rest/v1/asaas_webhook_events?payload->>event=eq.PAYMENT_RECEIVED",
                headers={**supabase_headers, "Prefer": ""},
            )
            requests.delete(
                f"{supabase_url}/rest/v1/invoices?id=eq.{inv['id']}",
                headers={**supabase_headers, "Prefer": ""},
            )
            requests.delete(
                f"{supabase_url}/rest/v1/subscriptions?id=eq.{sub_id}",
                headers={**supabase_headers, "Prefer": ""},
            )
