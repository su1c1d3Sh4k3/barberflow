"""
Tests for contact server-action business logic via Supabase REST API.

Mirrors the logic in src/lib/actions/contacts.ts:
- createContact, updateContact, toggleContactIA, deleteContact
- getContactAppointments, getContactMessages
- Unique phone constraint per tenant
"""
import requests
import uuid
from datetime import datetime, timedelta


# ─── Helpers ────────────────────────────────────────────────────────────────

def _unique_phone():
    return f"5511{uuid.uuid4().hex[:9]}"


def _create_contact(supabase_url, supabase_headers, tenant_id, **kwargs):
    """Mirrors createContact server action."""
    payload = {
        "tenant_id": tenant_id,
        "name": kwargs.get("name", "Test Contact"),
        "phone": kwargs.get("phone", _unique_phone()),
    }
    for field in ("birthday", "tags", "notes", "source", "ia_enabled", "status"):
        if field in kwargs:
            payload[field] = kwargs[field]

    resp = requests.post(
        f"{supabase_url}/rest/v1/contacts",
        headers=supabase_headers,
        json=payload,
    )
    return resp


def _delete_contact(supabase_url, supabase_headers, contact_id):
    h = {**supabase_headers, "Prefer": ""}
    requests.delete(f"{supabase_url}/rest/v1/contacts?id=eq.{contact_id}", headers=h)


# ─── Tests ──────────────────────────────────────────────────────────────────

def test_create_contact_all_fields(supabase_url, supabase_headers, test_tenant):
    """Create contact with all fields and verify them."""
    tid = test_tenant["tenant_id"]
    phone = _unique_phone()

    resp = _create_contact(
        supabase_url, supabase_headers, tid,
        name="Maria Completa",
        phone=phone,
        birthday="1990-05-15",
        tags=["vip", "recorrente"],
        notes="Cliente preferencial",
        source="whatsapp",
    )
    assert resp.status_code in (200, 201), f"Failed: {resp.text}"
    c = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

    assert c["name"] == "Maria Completa"
    assert c["phone"] == phone
    assert c["birthday"] == "1990-05-15"
    assert "vip" in c["tags"]
    assert "recorrente" in c["tags"]
    assert c["notes"] == "Cliente preferencial"
    assert c["source"] == "whatsapp"
    assert c["tenant_id"] == tid
    assert c["ia_enabled"] is True  # default
    assert c["status"] == "pendente"  # default

    _delete_contact(supabase_url, supabase_headers, c["id"])


def test_update_contact_name_phone(supabase_url, supabase_headers, test_tenant):
    """Update contact name and phone (mirrors updateContact action)."""
    tid = test_tenant["tenant_id"]

    resp = _create_contact(supabase_url, supabase_headers, tid, name="Old Name")
    assert resp.status_code in (200, 201)
    c = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

    new_phone = _unique_phone()
    patch = requests.patch(
        f"{supabase_url}/rest/v1/contacts?id=eq.{c['id']}",
        headers=supabase_headers,
        json={"name": "New Name", "phone": new_phone},
    )
    assert patch.status_code == 200
    updated = patch.json()[0]
    assert updated["name"] == "New Name"
    assert updated["phone"] == new_phone

    _delete_contact(supabase_url, supabase_headers, c["id"])


def test_toggle_ia_enabled(supabase_url, supabase_headers, test_tenant):
    """Toggle ia_enabled on a contact (mirrors toggleContactIA action)."""
    tid = test_tenant["tenant_id"]

    resp = _create_contact(supabase_url, supabase_headers, tid, ia_enabled=True)
    assert resp.status_code in (200, 201)
    c = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
    assert c["ia_enabled"] is True

    # Toggle off
    patch = requests.patch(
        f"{supabase_url}/rest/v1/contacts?id=eq.{c['id']}",
        headers=supabase_headers,
        json={"ia_enabled": False},
    )
    assert patch.status_code == 200
    assert patch.json()[0]["ia_enabled"] is False

    # Toggle back on
    patch2 = requests.patch(
        f"{supabase_url}/rest/v1/contacts?id=eq.{c['id']}",
        headers=supabase_headers,
        json={"ia_enabled": True},
    )
    assert patch2.status_code == 200
    assert patch2.json()[0]["ia_enabled"] is True

    _delete_contact(supabase_url, supabase_headers, c["id"])


def test_delete_contact(supabase_url, supabase_headers, test_tenant):
    """Delete contact and verify it is gone (mirrors deleteContact action)."""
    tid = test_tenant["tenant_id"]

    resp = _create_contact(supabase_url, supabase_headers, tid, name="To Delete")
    assert resp.status_code in (200, 201)
    c = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

    # Delete
    del_resp = requests.delete(
        f"{supabase_url}/rest/v1/contacts?id=eq.{c['id']}",
        headers={**supabase_headers, "Prefer": "return=representation"},
    )
    assert del_resp.status_code == 200

    # Verify gone
    check = requests.get(
        f"{supabase_url}/rest/v1/contacts?id=eq.{c['id']}&select=id",
        headers=supabase_headers,
    )
    assert check.status_code == 200
    assert len(check.json()) == 0


def test_get_contact_appointments(supabase_url, supabase_headers, test_tenant):
    """Create appointment for a contact, then query (mirrors getContactAppointments)."""
    tid = test_tenant["tenant_id"]
    cid = test_tenant["company_id"]
    unique = uuid.uuid4().hex[:6]

    # Contact
    c_resp = _create_contact(supabase_url, supabase_headers, tid, name=f"Appt-{unique}")
    assert c_resp.status_code in (200, 201)
    contact = c_resp.json()[0] if isinstance(c_resp.json(), list) else c_resp.json()

    # Professional
    pro = requests.post(
        f"{supabase_url}/rest/v1/professionals",
        headers=supabase_headers,
        json={"tenant_id": tid, "company_id": cid, "name": f"Pro-{unique}", "active": True},
    ).json()
    pro = pro[0] if isinstance(pro, list) else pro

    # Appointment
    start = (datetime.utcnow() + timedelta(days=30)).replace(hour=10, minute=0, second=0, microsecond=0)
    end = start + timedelta(minutes=30)
    appt_resp = requests.post(
        f"{supabase_url}/rest/v1/appointments",
        headers=supabase_headers,
        json={
            "tenant_id": tid,
            "company_id": cid,
            "contact_id": contact["id"],
            "professional_id": pro["id"],
            "start_at": start.isoformat() + "Z",
            "end_at": end.isoformat() + "Z",
            "status": "pendente",
        },
    )
    assert appt_resp.status_code in (200, 201)
    appt = appt_resp.json()[0] if isinstance(appt_resp.json(), list) else appt_resp.json()

    # Query contact appointments (mirrors getContactAppointments)
    resp = requests.get(
        f"{supabase_url}/rest/v1/appointments"
        f"?contact_id=eq.{contact['id']}"
        f"&select=*,professionals(name)"
        f"&order=start_at.desc"
        f"&limit=10",
        headers=supabase_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert data[0]["id"] == appt["id"]

    # Cleanup
    h = {**supabase_headers, "Prefer": ""}
    requests.delete(f"{supabase_url}/rest/v1/appointments?id=eq.{appt['id']}", headers=h)
    requests.delete(f"{supabase_url}/rest/v1/contacts?id=eq.{contact['id']}", headers=h)
    requests.delete(f"{supabase_url}/rest/v1/professionals?id=eq.{pro['id']}", headers=h)


def test_get_contact_messages(supabase_url, supabase_headers, test_tenant):
    """Insert message for a contact, then query (mirrors getContactMessages)."""
    tid = test_tenant["tenant_id"]

    # Contact
    c_resp = _create_contact(supabase_url, supabase_headers, tid, name="Msg Test")
    assert c_resp.status_code in (200, 201)
    contact = c_resp.json()[0] if isinstance(c_resp.json(), list) else c_resp.json()

    # Insert messages
    msg1_resp = requests.post(
        f"{supabase_url}/rest/v1/messages",
        headers=supabase_headers,
        json={
            "tenant_id": tid,
            "contact_id": contact["id"],
            "direction": "in",
            "content": "Oi, quero agendar",
            "sent_by": "human",
        },
    )
    assert msg1_resp.status_code in (200, 201)
    msg1 = msg1_resp.json()[0] if isinstance(msg1_resp.json(), list) else msg1_resp.json()

    msg2_resp = requests.post(
        f"{supabase_url}/rest/v1/messages",
        headers=supabase_headers,
        json={
            "tenant_id": tid,
            "contact_id": contact["id"],
            "direction": "out",
            "content": "Claro! Qual horário?",
            "sent_by": "ia",
        },
    )
    assert msg2_resp.status_code in (200, 201)
    msg2 = msg2_resp.json()[0] if isinstance(msg2_resp.json(), list) else msg2_resp.json()

    # Query messages (mirrors getContactMessages)
    resp = requests.get(
        f"{supabase_url}/rest/v1/messages"
        f"?contact_id=eq.{contact['id']}"
        f"&select=*"
        f"&order=created_at.desc"
        f"&limit=50",
        headers=supabase_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    directions = {m["direction"] for m in data}
    assert directions == {"in", "out"}

    # Cleanup
    h = {**supabase_headers, "Prefer": ""}
    requests.delete(f"{supabase_url}/rest/v1/messages?contact_id=eq.{contact['id']}", headers=h)
    requests.delete(f"{supabase_url}/rest/v1/contacts?id=eq.{contact['id']}", headers=h)


def test_unique_phone_constraint_per_tenant(supabase_url, supabase_headers, test_tenant):
    """Duplicate phone within the same tenant should fail (UNIQUE(tenant_id, phone))."""
    tid = test_tenant["tenant_id"]
    phone = _unique_phone()

    resp1 = _create_contact(supabase_url, supabase_headers, tid, phone=phone, name="First")
    assert resp1.status_code in (200, 201)
    c1 = resp1.json()[0] if isinstance(resp1.json(), list) else resp1.json()

    # Try duplicate
    resp2 = _create_contact(supabase_url, supabase_headers, tid, phone=phone, name="Second")
    assert resp2.status_code == 409, f"Expected 409 conflict, got {resp2.status_code}: {resp2.text}"

    _delete_contact(supabase_url, supabase_headers, c1["id"])
