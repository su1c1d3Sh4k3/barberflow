"""
Tests for the token usage billing cron job.
Endpoint: POST /api/cron/bill-token-usage
"""
import os
import requests
import pytest
from dotenv import load_dotenv

# Load CRON_SECRET from .env.local
_env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env.local")
load_dotenv(_env_path)
CRON_SECRET = os.getenv("CRON_SECRET", "")


class TestCronBillTokens:
    """Token usage billing cron job tests."""

    def test_bill_tokens_no_secret(self, app_url):
        """POST without x-cron-secret should return 401."""
        resp = requests.post(
            f"{app_url}/api/cron/bill-token-usage",
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 401, (
            f"Expected 401 without cron secret, got {resp.status_code}: {resp.text}"
        )

    def test_bill_tokens_wrong_secret(self, app_url):
        """POST with wrong secret should return 401."""
        resp = requests.post(
            f"{app_url}/api/cron/bill-token-usage",
            headers={
                "Content-Type": "application/json",
                "x-cron-secret": "totally-wrong-secret",
            },
        )
        assert resp.status_code == 401, (
            f"Expected 401 with wrong secret, got {resp.status_code}: {resp.text}"
        )

    def test_bill_tokens_with_secret(self, app_url):
        """POST with correct CRON_SECRET should return 200."""
        assert CRON_SECRET, "CRON_SECRET not found in .env.local"
        resp = requests.post(
            f"{app_url}/api/cron/bill-token-usage",
            headers={
                "Content-Type": "application/json",
                "x-cron-secret": CRON_SECRET,
            },
        )
        assert resp.status_code == 200, (
            f"Expected 200 with valid secret, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert data["success"] is True
        assert "billed_count" in data.get("data", {})

    def test_bill_tokens_returns_count(self, app_url):
        """Response should include billed_count as integer."""
        assert CRON_SECRET, "CRON_SECRET not found in .env.local"
        resp = requests.post(
            f"{app_url}/api/cron/bill-token-usage",
            headers={
                "Content-Type": "application/json",
                "x-cron-secret": CRON_SECRET,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        billed_count = data["data"]["billed_count"]
        assert isinstance(billed_count, int)
        assert billed_count >= 0

    def test_bill_tokens_processes_ledger(
        self, app_url, supabase_url, supabase_headers, test_tenant
    ):
        """Create an unbilled ledger entry and verify it gets billed."""
        assert CRON_SECRET, "CRON_SECRET not found in .env.local"
        tenant_id = test_tenant["tenant_id"]

        # 1. Find or create an IA plan
        plans_resp = requests.get(
            f"{supabase_url}/rest/v1/plans?has_ia=eq.true&active=eq.true&select=id&limit=1",
            headers=supabase_headers,
        )
        if plans_resp.status_code == 200 and plans_resp.json():
            plan_id = plans_resp.json()[0]["id"]
        else:
            # Create a test IA plan
            plan_resp = requests.post(
                f"{supabase_url}/rest/v1/plans",
                headers=supabase_headers,
                json={
                    "id": "test-ia-plan",
                    "name": "Plano IA Test",
                    "tier": "ia",
                    "billing_type": "recurrent",
                    "price_monthly": 99.90,
                    "total_value": 99.90,
                    "cycle_months": 1,
                    "has_ia": True,
                    "active": True,
                },
            )
            assert plan_resp.status_code in (200, 201, 409), (
                f"Failed to create plan: {plan_resp.text}"
            )
            plan_id = "test-ia-plan"

        # 2. Create an active subscription for the test tenant
        sub_resp = requests.post(
            f"{supabase_url}/rest/v1/subscriptions",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "plan_id": plan_id,
                "status": "active",
                "current_period_start": "2026-04-01T00:00:00Z",
                "current_period_end": "2026-04-30T23:59:59Z",
            },
        )
        # Could be 409 if subscription already exists for tenant (unique constraint)
        if sub_resp.status_code == 409:
            # Update existing subscription
            requests.patch(
                f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}",
                headers=supabase_headers,
                json={"plan_id": plan_id, "status": "active"},
            )
            sub_get = requests.get(
                f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}&select=id",
                headers=supabase_headers,
            )
            sub_id = sub_get.json()[0]["id"]
        else:
            assert sub_resp.status_code in (200, 201), (
                f"Failed to create subscription: {sub_resp.text}"
            )
            sub_data = sub_resp.json()
            sub_id = sub_data[0]["id"] if isinstance(sub_data, list) else sub_data["id"]

        # 3. Create an unbilled token_usage_ledger entry
        ledger_resp = requests.post(
            f"{supabase_url}/rest/v1/token_usage_ledger",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "subscription_id": sub_id,
                "period_start": "2026-04-01",
                "period_end": "2026-04-30",
                "tokens_input": 50000,
                "tokens_output": 10000,
                "estimated_cost": 1.50,
                "billed": False,
            },
        )
        assert ledger_resp.status_code in (200, 201), (
            f"Failed to create ledger entry: {ledger_resp.text}"
        )
        ledger_data = ledger_resp.json()
        ledger_id = ledger_data[0]["id"] if isinstance(ledger_data, list) else ledger_data["id"]

        try:
            # 4. Run the cron
            resp = requests.post(
                f"{app_url}/api/cron/bill-token-usage",
                headers={
                    "Content-Type": "application/json",
                    "x-cron-secret": CRON_SECRET,
                },
            )
            assert resp.status_code == 200, (
                f"Expected 200, got {resp.status_code}: {resp.text}"
            )
            data = resp.json()
            assert data["data"]["billed_count"] >= 1, (
                f"Expected at least 1 billed, got {data['data']['billed_count']}"
            )

            # 5. Verify the ledger entry is now marked as billed
            check = requests.get(
                f"{supabase_url}/rest/v1/token_usage_ledger?id=eq.{ledger_id}&select=billed,invoice_id",
                headers=supabase_headers,
            )
            assert check.status_code == 200
            entry = check.json()[0]
            assert entry["billed"] is True, "Ledger entry should be marked as billed"
            assert entry["invoice_id"] is not None, "Ledger entry should have invoice_id"

            # 6. Verify invoice was created
            invoice_check = requests.get(
                f"{supabase_url}/rest/v1/invoices?id=eq.{entry['invoice_id']}&select=type,value,tenant_id",
                headers=supabase_headers,
            )
            assert invoice_check.status_code == 200
            if invoice_check.json():
                invoice = invoice_check.json()[0]
                assert invoice["type"] == "tokens_addon"
                assert float(invoice["value"]) == 1.50
                assert invoice["tenant_id"] == tenant_id

        finally:
            # Cleanup: delete ledger entry, invoice, and subscription
            requests.delete(
                f"{supabase_url}/rest/v1/token_usage_ledger?id=eq.{ledger_id}",
                headers={**supabase_headers, "Prefer": ""},
            )
            # Delete invoices for this tenant
            requests.delete(
                f"{supabase_url}/rest/v1/invoices?tenant_id=eq.{tenant_id}",
                headers={**supabase_headers, "Prefer": ""},
            )
            # Delete subscription
            requests.delete(
                f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}",
                headers={**supabase_headers, "Prefer": ""},
            )

    def test_bill_tokens_marks_billed_true(
        self, app_url, supabase_url, supabase_headers, test_tenant
    ):
        """After billing, running the cron again should not re-bill the same entry."""
        assert CRON_SECRET, "CRON_SECRET not found in .env.local"

        # Run cron twice - second run should not increase count for already-billed entries
        resp1 = requests.post(
            f"{app_url}/api/cron/bill-token-usage",
            headers={
                "Content-Type": "application/json",
                "x-cron-secret": CRON_SECRET,
            },
        )
        assert resp1.status_code == 200

        resp2 = requests.post(
            f"{app_url}/api/cron/bill-token-usage",
            headers={
                "Content-Type": "application/json",
                "x-cron-secret": CRON_SECRET,
            },
        )
        assert resp2.status_code == 200
        # Second run should have 0 billed (nothing new to bill)
        data2 = resp2.json()
        assert data2["data"]["billed_count"] == 0, (
            f"Expected 0 on second run, got {data2['data']['billed_count']}"
        )
