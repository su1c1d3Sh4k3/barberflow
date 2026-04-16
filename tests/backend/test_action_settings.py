"""
Tests for settings server-action business logic via Supabase REST API.

Mirrors the logic in src/lib/actions/settings.ts:
- upsertSettings (welcome_message, birthday settings, pix)
- upsertFollowup (create/update followups, up to 3)
- createCoupon
- upsertIASettings
- getWhatsAppSession
"""
import requests
import uuid
from datetime import datetime, timedelta


# ─── Tests ──────────────────────────────────────────────────────────────────

def test_upsert_settings_welcome_message(supabase_url, supabase_headers, test_tenant):
    """Upsert settings: update welcome_message (mirrors upsertSettings action)."""
    tid = test_tenant["tenant_id"]

    # Settings already exist from conftest; upsert with new values
    resp = requests.patch(
        f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tid}",
        headers=supabase_headers,
        json={"welcome_message": "Olá! Agende seu horário conosco."},
    )
    assert resp.status_code == 200
    updated = resp.json()[0]
    assert updated["welcome_message"] == "Olá! Agende seu horário conosco."


def test_upsert_settings_birthday(supabase_url, supabase_headers, test_tenant):
    """Upsert settings: birthday_enabled, birthday_message, birthday_send_time."""
    tid = test_tenant["tenant_id"]

    resp = requests.patch(
        f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tid}",
        headers=supabase_headers,
        json={
            "birthday_enabled": True,
            "birthday_message": "Feliz aniversário! Ganhe 10% de desconto.",
            "birthday_send_time": "10:00",
        },
    )
    assert resp.status_code == 200
    updated = resp.json()[0]
    assert updated["birthday_enabled"] is True
    assert updated["birthday_message"] == "Feliz aniversário! Ganhe 10% de desconto."
    assert updated["birthday_send_time"] == "10:00:00"

    # Revert
    requests.patch(
        f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tid}",
        headers=supabase_headers,
        json={"birthday_enabled": False},
    )


def test_upsert_settings_pix(supabase_url, supabase_headers, test_tenant):
    """Upsert settings: pix_key and payment_link."""
    tid = test_tenant["tenant_id"]

    resp = requests.patch(
        f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tid}",
        headers=supabase_headers,
        json={
            "pix_key": "12345678901",
            "payment_link": "https://pay.example.com/barbearia",
        },
    )
    assert resp.status_code == 200
    updated = resp.json()[0]
    assert updated["pix_key"] == "12345678901"
    assert updated["payment_link"] == "https://pay.example.com/barbearia"


def test_create_followups(supabase_url, supabase_headers, test_tenant):
    """Create 3 followup rules (mirrors upsertFollowup action with insert)."""
    tid = test_tenant["tenant_id"]

    followups = [
        {
            "tenant_id": tid,
            "order_num": 1,
            "delay_hours": 24,
            "message": "Lembrete: seu horário é amanhã!",
            "enabled": True,
        },
        {
            "tenant_id": tid,
            "order_num": 2,
            "delay_hours": 2,
            "message": "Como foi o atendimento? Avalie!",
            "enabled": True,
        },
        {
            "tenant_id": tid,
            "order_num": 3,
            "delay_hours": 720,
            "message": "Faz tempo! Agende seu próximo corte.",
            "enabled": False,
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

    # Verify order
    orders = sorted([f["order_num"] for f in data])
    assert orders == [1, 2, 3]

    # Verify enabled flags
    f3 = [f for f in data if f["order_num"] == 3][0]
    assert f3["enabled"] is False

    # Cleanup
    h = {**supabase_headers, "Prefer": ""}
    for f in data:
        requests.delete(f"{supabase_url}/rest/v1/followups?id=eq.{f['id']}", headers=h)


def test_update_followup(supabase_url, supabase_headers, test_tenant):
    """Update an existing followup (mirrors upsertFollowup action with id)."""
    tid = test_tenant["tenant_id"]

    # Create one followup
    resp = requests.post(
        f"{supabase_url}/rest/v1/followups",
        headers=supabase_headers,
        json={
            "tenant_id": tid,
            "order_num": 1,
            "delay_hours": 24,
            "message": "Original message",
            "enabled": True,
        },
    )
    assert resp.status_code in (200, 201)
    f = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

    # Update it
    patch = requests.patch(
        f"{supabase_url}/rest/v1/followups?id=eq.{f['id']}",
        headers=supabase_headers,
        json={
            "delay_hours": 48,
            "message": "Updated message",
            "enabled": False,
        },
    )
    assert patch.status_code == 200
    updated = patch.json()[0]
    assert updated["delay_hours"] == 48
    assert updated["message"] == "Updated message"
    assert updated["enabled"] is False

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/followups?id=eq.{f['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_create_coupon(supabase_url, supabase_headers, test_tenant):
    """Create a coupon (mirrors createCoupon action)."""
    tid = test_tenant["tenant_id"]

    resp = requests.post(
        f"{supabase_url}/rest/v1/coupons",
        headers=supabase_headers,
        json={
            "tenant_id": tid,
            "base_name": "PROMO20",
            "discount_pct": 20,
            "duration_days": 14,
        },
    )
    assert resp.status_code in (200, 201), f"Failed: {resp.text}"
    coupon = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

    assert coupon["base_name"] == "PROMO20"
    assert coupon["discount_pct"] == 20
    assert coupon["duration_days"] == 14
    assert coupon["tenant_id"] == tid

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/coupons?id=eq.{coupon['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_upsert_ia_settings(supabase_url, supabase_headers, test_tenant):
    """Upsert IA settings (mirrors upsertIASettings action)."""
    tid = test_tenant["tenant_id"]

    # Insert IA settings
    resp = requests.post(
        f"{supabase_url}/rest/v1/ia_settings",
        headers={**supabase_headers, "Prefer": "return=representation,resolution=merge-duplicates"},
        json={
            "tenant_id": tid,
            "enabled": True,
            "tone": "formal",
            "instructions": "Você é assistente da barbearia. Seja educado.",
            "test_mode": False,
            "handoff_keywords": ["falar com humano", "atendente"],
        },
    )
    assert resp.status_code in (200, 201), f"Failed: {resp.text}"
    ia = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
    assert ia["enabled"] is True
    assert ia["tone"] == "formal"
    assert "falar com humano" in ia["handoff_keywords"]

    # Upsert: update tone
    resp2 = requests.post(
        f"{supabase_url}/rest/v1/ia_settings",
        headers={**supabase_headers, "Prefer": "return=representation,resolution=merge-duplicates"},
        json={
            "tenant_id": tid,
            "tone": "humorado",
            "instructions": "Seja engraçado e simpático!",
        },
    )
    assert resp2.status_code in (200, 201)
    ia2 = resp2.json()[0] if isinstance(resp2.json(), list) else resp2.json()
    assert ia2["tone"] == "humorado"
    assert ia2["instructions"] == "Seja engraçado e simpático!"

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/ia_settings?tenant_id=eq.{tid}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_get_whatsapp_session(supabase_url, supabase_headers, test_tenant):
    """Create and get WhatsApp session (mirrors getWhatsAppSession action)."""
    tid = test_tenant["tenant_id"]

    # Delete any existing session (UNIQUE tenant_id constraint)
    requests.delete(
        f"{supabase_url}/rest/v1/whatsapp_sessions?tenant_id=eq.{tid}",
        headers={**supabase_headers, "Prefer": ""},
    )
    # Insert session
    resp = requests.post(
        f"{supabase_url}/rest/v1/whatsapp_sessions",
        headers=supabase_headers,
        json={
            "tenant_id": tid,
            "instance_id": "test-instance-001",
            "instance_token": "tok_test_abc123",
            "phone_number": "5511999000111",
            "status": "disconnected",
        },
    )
    assert resp.status_code in (200, 201), f"Failed: {resp.text}"
    session = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

    # Query session (mirrors getWhatsAppSession)
    get_resp = requests.get(
        f"{supabase_url}/rest/v1/whatsapp_sessions?tenant_id=eq.{tid}&select=*",
        headers=supabase_headers,
    )
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert len(data) >= 1
    found = data[0]
    assert found["instance_id"] == "test-instance-001"
    assert found["status"] == "disconnected"
    assert found["phone_number"] == "5511999000111"

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
