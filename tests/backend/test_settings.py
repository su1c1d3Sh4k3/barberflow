"""
Tests for settings, followups, coupons, and IA settings tables.
"""
import requests
import uuid
from datetime import datetime, timedelta


def test_settings_upsert(supabase_url, supabase_headers, test_tenant):
    """Insert/update settings for the tenant."""
    tenant_id = test_tenant["tenant_id"]

    # Settings should already exist from conftest
    resp = requests.get(
        f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}&select=*",
        headers=supabase_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1

    # Update settings
    patch_resp = requests.patch(
        f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}",
        headers=supabase_headers,
        json={"welcome_message": "Bem-vindo atualizado!", "birthday_enabled": True},
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()[0]
    assert updated["welcome_message"] == "Bem-vindo atualizado!"


def test_followup_create(supabase_url, supabase_headers, test_tenant):
    """Insert 3 followup rules."""
    tenant_id = test_tenant["tenant_id"]
    followups = [
        {
            "tenant_id": tenant_id,
            "order_num": 1,
            "delay_hours": 24,
            "message": "Olá! Lembrete do seu horário amanhã.",
            "enabled": True,
        },
        {
            "tenant_id": tenant_id,
            "order_num": 2,
            "delay_hours": 2,
            "message": "Como foi o atendimento?",
            "enabled": True,
        },
        {
            "tenant_id": tenant_id,
            "order_num": 3,
            "delay_hours": 720,
            "message": "Faz tempo que não te vemos!",
            "enabled": True,
        },
    ]

    resp = requests.post(
        f"{supabase_url}/rest/v1/followups",
        headers=supabase_headers,
        json=followups,
    )
    assert resp.status_code in (200, 201), f"Failed: {resp.text}"
    data = resp.json()
    assert len(data) == 3

    # Cleanup
    for f in data:
        requests.delete(
            f"{supabase_url}/rest/v1/followups?id=eq.{f['id']}",
            headers={**supabase_headers, "Prefer": ""},
        )


def test_coupon_create(supabase_url, supabase_headers, test_tenant):
    """Insert a coupon and a coupon_instance."""
    tenant_id = test_tenant["tenant_id"]

    # Create a contact for the coupon instance
    contact_resp = requests.post(
        f"{supabase_url}/rest/v1/contacts",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "Coupon Client", "phone": f"55119{uuid.uuid4().hex[:8]}"},
    )
    assert contact_resp.status_code in (200, 201)
    contact = contact_resp.json()[0] if isinstance(contact_resp.json(), list) else contact_resp.json()

    # Create coupon
    coupon_resp = requests.post(
        f"{supabase_url}/rest/v1/coupons",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "base_name": "DESCONTO10",
            "discount_pct": 10,
            "duration_days": 30,
        },
    )
    assert coupon_resp.status_code in (200, 201), f"Failed: {coupon_resp.text}"
    coupon = coupon_resp.json()[0] if isinstance(coupon_resp.json(), list) else coupon_resp.json()
    assert coupon["base_name"] == "DESCONTO10"

    # Create coupon instance
    instance_resp = requests.post(
        f"{supabase_url}/rest/v1/coupon_instances",
        headers=supabase_headers,
        json={
            "coupon_id": coupon["id"],
            "contact_id": contact["id"],
            "code": f"DESC10-{uuid.uuid4().hex[:6].upper()}",
            "expires_at": (datetime.utcnow() + timedelta(days=30)).isoformat() + "Z",
        },
    )
    assert instance_resp.status_code in (200, 201), f"Failed: {instance_resp.text}"

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/coupon_instances?coupon_id=eq.{coupon['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
    requests.delete(
        f"{supabase_url}/rest/v1/coupons?id=eq.{coupon['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
    requests.delete(
        f"{supabase_url}/rest/v1/contacts?id=eq.{contact['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_ia_settings(supabase_url, supabase_headers, test_tenant):
    """Insert IA settings for the tenant."""
    tenant_id = test_tenant["tenant_id"]

    resp = requests.post(
        f"{supabase_url}/rest/v1/ia_settings",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "enabled": True,
            "tone": "simpatico",
            "instructions": "Você é um assistente de barbearia.",
        },
    )
    assert resp.status_code in (200, 201), f"Failed: {resp.text}"
    ia = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
    assert ia["tone"] == "simpatico"
    assert ia["enabled"] is True

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/ia_settings?tenant_id=eq.{tenant_id}",
        headers={**supabase_headers, "Prefer": ""},
    )
