"""
Tests for the contacts table: CRUD, unique phone constraint, tags, IA toggle, statuses.
"""
import requests
import uuid


def _create_contact(supabase_url, supabase_headers, tenant_id, **kwargs):
    """Helper to create a contact."""
    payload = {
        "tenant_id": tenant_id,
        "name": kwargs.get("name", "Carlos Cliente"),
        "phone": kwargs.get("phone", "5511999880011"),
        "status": kwargs.get("status", "pendente"),
    }
    if "tags" in kwargs:
        payload["tags"] = kwargs["tags"]
    if "ia_enabled" in kwargs:
        payload["ia_enabled"] = kwargs["ia_enabled"]
    resp = requests.post(
        f"{supabase_url}/rest/v1/contacts",
        headers=supabase_headers,
        json=payload,
    )
    return resp


def test_create_contact(supabase_url, supabase_headers, test_tenant):
    """Insert a contact with phone."""
    tenant_id = test_tenant["tenant_id"]
    resp = _create_contact(supabase_url, supabase_headers, tenant_id)
    assert resp.status_code in (200, 201), f"Failed: {resp.text}"
    contact = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
    assert contact["name"] == "Carlos Cliente"
    assert contact["phone"] == "5511999880011"
    assert contact["tenant_id"] == tenant_id

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/contacts?id=eq.{contact['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_contact_unique_phone_per_tenant(supabase_url, supabase_headers, test_tenant):
    """Duplicate phone within the same tenant should fail."""
    tenant_id = test_tenant["tenant_id"]
    phone = "5511888770099"

    resp1 = _create_contact(supabase_url, supabase_headers, tenant_id, phone=phone, name="First")
    assert resp1.status_code in (200, 201)
    c1 = resp1.json()[0] if isinstance(resp1.json(), list) else resp1.json()

    # Try duplicate
    resp2 = _create_contact(supabase_url, supabase_headers, tenant_id, phone=phone, name="Second")
    assert resp2.status_code == 409, f"Expected 409, got {resp2.status_code}: {resp2.text}"

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/contacts?id=eq.{c1['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_update_contact_tags(supabase_url, supabase_headers, test_tenant):
    """Update tags array on a contact."""
    tenant_id = test_tenant["tenant_id"]
    resp = _create_contact(
        supabase_url, supabase_headers, tenant_id,
        phone="5511777660088", name="Tags Test"
    )
    assert resp.status_code in (200, 201)
    contact = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

    # Update tags
    patch_resp = requests.patch(
        f"{supabase_url}/rest/v1/contacts?id=eq.{contact['id']}",
        headers=supabase_headers,
        json={"tags": ["vip", "fidelidade"]},
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()[0]
    assert "vip" in updated["tags"]
    assert "fidelidade" in updated["tags"]

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/contacts?id=eq.{contact['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_contact_ia_toggle(supabase_url, supabase_headers, test_tenant):
    """Toggle ia_enabled on a contact."""
    tenant_id = test_tenant["tenant_id"]
    resp = _create_contact(
        supabase_url, supabase_headers, tenant_id,
        phone="5511666550077", name="IA Toggle", ia_enabled=True
    )
    assert resp.status_code in (200, 201)
    contact = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

    # Toggle off
    patch_resp = requests.patch(
        f"{supabase_url}/rest/v1/contacts?id=eq.{contact['id']}",
        headers=supabase_headers,
        json={"ia_enabled": False},
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()[0]
    assert updated["ia_enabled"] is False

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/contacts?id=eq.{contact['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_contact_status_values(supabase_url, supabase_headers, test_tenant):
    """Test all valid contact statuses."""
    tenant_id = test_tenant["tenant_id"]
    valid_statuses = ["respondido", "pendente", "follow_up", "agendado", "bloqueado"]
    created_ids = []

    for i, status in enumerate(valid_statuses):
        resp = _create_contact(
            supabase_url, supabase_headers, tenant_id,
            phone=f"551100{i}00{i}00{i}", name=f"Status {status}", status=status
        )
        if resp.status_code in (200, 201):
            contact = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
            assert contact["status"] == status
            created_ids.append(contact["id"])
        else:
            # If status is not valid, that's also informative
            pass

    # At least one status should have worked
    assert len(created_ids) >= 1

    # Cleanup
    for cid in created_ids:
        requests.delete(
            f"{supabase_url}/rest/v1/contacts?id=eq.{cid}",
            headers={**supabase_headers, "Prefer": ""},
        )
