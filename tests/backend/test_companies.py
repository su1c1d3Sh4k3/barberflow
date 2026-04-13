"""
Tests for the companies table: CRUD, FK relationships.
"""
import requests
import uuid


def test_company_exists(supabase_url, supabase_headers, test_tenant):
    """Verify the default company was created and linked to the tenant."""
    tenant_id = test_tenant["tenant_id"]
    resp = requests.get(
        f"{supabase_url}/rest/v1/companies?tenant_id=eq.{tenant_id}&select=*",
        headers=supabase_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert any(c["is_default"] is True for c in data)


def test_create_company(supabase_url, supabase_headers, test_tenant):
    """Insert a second company for the tenant."""
    tenant_id = test_tenant["tenant_id"]
    resp = requests.post(
        f"{supabase_url}/rest/v1/companies",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "name": "Filial Centro",
            "is_default": False,
            "address": "Rua A, 123",
            "phone": "11999990000",
        },
    )
    assert resp.status_code in (200, 201), f"Failed: {resp.text}"
    company = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
    assert company["name"] == "Filial Centro"
    assert company["tenant_id"] == tenant_id

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/companies?id=eq.{company['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_update_company(supabase_url, supabase_headers, test_tenant):
    """Update name and address of the default company."""
    company_id = test_tenant["company_id"]
    resp = requests.patch(
        f"{supabase_url}/rest/v1/companies?id=eq.{company_id}",
        headers=supabase_headers,
        json={"name": "Barbearia Teste Updated", "address": "Rua Nova, 456"},
    )
    assert resp.status_code == 200
    updated = resp.json()[0]
    assert updated["name"] == "Barbearia Teste Updated"
    assert updated["address"] == "Rua Nova, 456"

    # Restore original
    requests.patch(
        f"{supabase_url}/rest/v1/companies?id=eq.{company_id}",
        headers=supabase_headers,
        json={"name": "Barbearia Teste", "address": None},
    )


def test_company_has_tenant_fk(supabase_url, supabase_headers, test_tenant):
    """Inserting a company with a non-existent tenant_id should fail."""
    fake_tenant_id = str(uuid.uuid4())
    resp = requests.post(
        f"{supabase_url}/rest/v1/companies",
        headers=supabase_headers,
        json={
            "tenant_id": fake_tenant_id,
            "name": "Orphan Company",
            "is_default": False,
        },
    )
    # Should fail with FK violation (409 conflict or 400/403)
    assert resp.status_code in (400, 409), f"Expected FK error, got {resp.status_code}: {resp.text}"
