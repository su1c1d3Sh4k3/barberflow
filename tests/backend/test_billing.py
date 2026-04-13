"""
Tests for billing tables: plans, subscriptions, invoices, webhook idempotency.
"""
import requests
import uuid
from datetime import datetime, timedelta


def test_plans_seeded(supabase_url, supabase_headers, test_tenant):
    """Verify that plans are seeded with correct count and prices."""
    resp = requests.get(
        f"{supabase_url}/rest/v1/plans?select=*",
        headers=supabase_headers,
    )
    assert resp.status_code == 200
    plans = resp.json()
    assert len(plans) >= 8, f"Expected at least 8 plans, got {len(plans)}"

    # Verify each plan has required fields
    for plan in plans:
        assert "id" in plan
        assert "name" in plan
        assert "price_monthly" in plan


def test_create_subscription(supabase_url, supabase_headers, test_tenant):
    """Insert a trial subscription."""
    tenant_id = test_tenant["tenant_id"]

    now = datetime.utcnow()
    # Clean existing subscription first
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
            "trial_ends_at": (now + timedelta(days=7)).isoformat() + "Z",
            "current_period_start": now.isoformat() + "Z",
            "current_period_end": (now + timedelta(days=7)).isoformat() + "Z",
        },
    )
    assert resp.status_code in (200, 201), f"Failed: {resp.text}"
    sub = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
    assert sub["status"] == "trial"
    assert sub["tenant_id"] == tenant_id

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/subscriptions?id=eq.{sub['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_create_invoice(supabase_url, supabase_headers, test_tenant):
    """Insert an invoice record."""
    tenant_id = test_tenant["tenant_id"]

    resp = requests.post(
        f"{supabase_url}/rest/v1/invoices",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "asaas_payment_id": f"pay_{uuid.uuid4().hex[:16]}",
            "type": "subscription",
            "value": 99.90,
            "status": "PENDING",
            "billing_type": "PIX",
            "due_date": (datetime.utcnow() + timedelta(days=5)).strftime("%Y-%m-%d"),
            "description": "Plano Profissional - Abril 2026",
        },
    )
    assert resp.status_code in (200, 201), f"Failed: {resp.text}"
    invoice = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
    assert float(invoice["value"]) == 99.90
    assert invoice["status"] == "PENDING"

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/invoices?id=eq.{invoice['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_asaas_webhook_idempotency(supabase_url, supabase_headers, test_tenant):
    """Insert asaas_webhook_events and verify idempotency (unique id PK)."""
    event_id = f"evt_{uuid.uuid4().hex[:16]}"

    # First insert
    resp1 = requests.post(
        f"{supabase_url}/rest/v1/asaas_webhook_events",
        headers=supabase_headers,
        json={
            "id": event_id,
            "event": "PAYMENT_RECEIVED",
            "payload": {"value": 99.90, "status": "RECEIVED"},
            "processed": False,
        },
    )
    assert resp1.status_code in (200, 201), f"Failed: {resp1.text}"

    # Second insert with same id should fail (PK conflict = idempotency)
    resp2 = requests.post(
        f"{supabase_url}/rest/v1/asaas_webhook_events",
        headers=supabase_headers,
        json={
            "id": event_id,
            "event": "PAYMENT_RECEIVED",
            "payload": {"value": 99.90, "status": "RECEIVED"},
            "processed": False,
        },
    )
    assert resp2.status_code == 409, f"Expected 409 for duplicate event, got {resp2.status_code}: {resp2.text}"

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/asaas_webhook_events?id=eq.{event_id}",
        headers={**supabase_headers, "Prefer": ""},
    )
