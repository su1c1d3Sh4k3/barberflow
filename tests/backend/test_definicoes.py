"""
Backend tests for settings, followups, coupons, and IA settings (definicoes features).
"""
import requests
import uuid
from datetime import datetime, timedelta


def test_upsert_welcome_message(supabase_url, supabase_headers, test_tenant):
    """Upsert settings.welcome_message for the tenant."""
    tenant_id = test_tenant["tenant_id"]

    resp = requests.patch(
        f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}",
        headers=supabase_headers,
        json={"welcome_message": "Olá! Seja bem-vindo à nossa barbearia!"},
    )
    assert resp.status_code in (200, 204), f"Failed: {resp.text}"

    # Verify
    get_resp = requests.get(
        f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}&select=welcome_message",
        headers=supabase_headers,
    )
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert len(data) >= 1
    assert data[0]["welcome_message"] == "Olá! Seja bem-vindo à nossa barbearia!"


def test_upsert_birthday_settings(supabase_url, supabase_headers, test_tenant):
    """Upsert birthday_enabled, birthday_message, and birthday_send_time."""
    tenant_id = test_tenant["tenant_id"]

    resp = requests.patch(
        f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}",
        headers=supabase_headers,
        json={
            "birthday_enabled": True,
            "birthday_message": "Feliz aniversário! Temos um presente para você!",
            "birthday_send_time": "09:00",
        },
    )
    assert resp.status_code in (200, 204), f"Failed: {resp.text}"

    # Verify
    get_resp = requests.get(
        f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}&select=birthday_enabled,birthday_message,birthday_send_time",
        headers=supabase_headers,
    )
    assert get_resp.status_code == 200
    data = get_resp.json()[0]
    assert data["birthday_enabled"] is True
    assert "aniversário" in data["birthday_message"]
    assert data["birthday_send_time"].startswith("09:00")


def test_upsert_pix_settings(supabase_url, supabase_headers, test_tenant):
    """Upsert pix_key and payment_link settings."""
    tenant_id = test_tenant["tenant_id"]

    resp = requests.patch(
        f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}",
        headers=supabase_headers,
        json={
            "pix_key": "barbearia@email.com",
            "payment_link": "https://pay.example.com/barbearia",
        },
    )
    assert resp.status_code in (200, 204), f"Failed: {resp.text}"

    # Verify
    get_resp = requests.get(
        f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}&select=pix_key,payment_link",
        headers=supabase_headers,
    )
    assert get_resp.status_code == 200
    data = get_resp.json()[0]
    assert data["pix_key"] == "barbearia@email.com"
    assert data["payment_link"] == "https://pay.example.com/barbearia"


def test_create_and_list_followups(supabase_url, supabase_headers, test_tenant):
    """Insert 2 followups, then query and verify they are returned in order."""
    tenant_id = test_tenant["tenant_id"]

    followups = [
        {
            "tenant_id": tenant_id,
            "order_num": 1,
            "delay_hours": 2,
            "message": "Como foi o atendimento? Avalie!",
            "enabled": True,
        },
        {
            "tenant_id": tenant_id,
            "order_num": 2,
            "delay_hours": 168,
            "message": "Já faz uma semana! Agende seu próximo corte.",
            "enabled": True,
        },
    ]

    resp = requests.post(
        f"{supabase_url}/rest/v1/followups",
        headers=supabase_headers,
        json=followups,
    )
    assert resp.status_code in (200, 201), f"Failed to create followups: {resp.text}"
    created = resp.json()
    assert len(created) == 2

    # List and verify order
    list_resp = requests.get(
        f"{supabase_url}/rest/v1/followups?tenant_id=eq.{tenant_id}&order=order_num.asc",
        headers=supabase_headers,
    )
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert len(items) >= 2
    assert items[0]["order_num"] < items[1]["order_num"]
    assert items[0]["delay_hours"] == 2
    assert items[1]["delay_hours"] == 168

    # Cleanup
    for f in created:
        requests.delete(
            f"{supabase_url}/rest/v1/followups?id=eq.{f['id']}",
            headers={**supabase_headers, "Prefer": ""},
        )


def test_create_coupon_and_instance(supabase_url, supabase_headers, test_tenant):
    """Insert a coupon, then insert a coupon_instance with a unique code."""
    tenant_id = test_tenant["tenant_id"]

    # Create contact
    contact_resp = requests.post(
        f"{supabase_url}/rest/v1/contacts",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "Cliente Cupom", "phone": f"5511{uuid.uuid4().hex[:8]}"},
    )
    assert contact_resp.status_code in (200, 201)
    contact = contact_resp.json()[0] if isinstance(contact_resp.json(), list) else contact_resp.json()

    # Create coupon
    coupon_resp = requests.post(
        f"{supabase_url}/rest/v1/coupons",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "base_name": "BEMVINDO15",
            "discount_pct": 15,
            "duration_days": 7,
        },
    )
    assert coupon_resp.status_code in (200, 201), f"Failed: {coupon_resp.text}"
    coupon = coupon_resp.json()[0] if isinstance(coupon_resp.json(), list) else coupon_resp.json()
    assert coupon["base_name"] == "BEMVINDO15"

    # Create coupon instance with code
    code = f"BV15-{uuid.uuid4().hex[:6].upper()}"
    instance_resp = requests.post(
        f"{supabase_url}/rest/v1/coupon_instances",
        headers=supabase_headers,
        json={
            "coupon_id": coupon["id"],
            "contact_id": contact["id"],
            "code": code,
            "expires_at": (datetime.utcnow() + timedelta(days=7)).isoformat() + "Z",
        },
    )
    assert instance_resp.status_code in (200, 201), f"Failed: {instance_resp.text}"
    instance = instance_resp.json()[0] if isinstance(instance_resp.json(), list) else instance_resp.json()
    assert instance["code"] == code

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


def test_update_ia_settings(supabase_url, supabase_headers, test_tenant):
    """Upsert ia_settings with all fields including test_mode and handoff_keywords."""
    tenant_id = test_tenant["tenant_id"]

    ia_data = {
        "tenant_id": tenant_id,
        "enabled": True,
        "tone": "educado",
        "instructions": "Você é um assistente virtual da barbearia. Seja educado e objetivo.",
        "test_mode": True,
        "test_numbers": ["5511999990001", "5511999990002"],
        "handoff_keywords": ["atendente", "humano", "pessoa real"],
    }

    # Delete existing first (in case another test created one)
    requests.delete(
        f"{supabase_url}/rest/v1/ia_settings?tenant_id=eq.{tenant_id}",
        headers={**supabase_headers, "Prefer": ""},
    )

    # Insert
    resp = requests.post(
        f"{supabase_url}/rest/v1/ia_settings",
        headers=supabase_headers,
        json=ia_data,
    )
    assert resp.status_code in (200, 201), f"Failed to create ia_settings: {resp.text}"
    created = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
    assert created["enabled"] is True
    assert created["tone"] == "educado"
    assert created["test_mode"] is True
    assert "atendente" in created["handoff_keywords"]
    assert len(created["test_numbers"]) == 2

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/ia_settings?tenant_id=eq.{tenant_id}",
        headers={**supabase_headers, "Prefer": ""},
    )
