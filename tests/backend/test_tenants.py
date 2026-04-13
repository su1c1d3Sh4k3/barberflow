"""
Tests for the tenants table: existence, required fields, unique slug constraint.
"""
import requests
import uuid


def test_tenant_exists(supabase_url, supabase_headers, test_tenant):
    """Verify the test tenant was created and can be fetched."""
    tenant_id = test_tenant["tenant_id"]
    resp = requests.get(
        f"{supabase_url}/rest/v1/tenants?id=eq.{tenant_id}&select=*",
        headers=supabase_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == tenant_id


def test_tenant_has_fields(supabase_url, supabase_headers, test_tenant):
    """Verify tenant record has all expected fields."""
    tenant_id = test_tenant["tenant_id"]
    resp = requests.get(
        f"{supabase_url}/rest/v1/tenants?id=eq.{tenant_id}&select=*",
        headers=supabase_headers,
    )
    assert resp.status_code == 200
    tenant = resp.json()[0]
    assert "id" in tenant
    assert "name" in tenant
    assert "plan" in tenant
    assert "created_at" in tenant
    assert tenant["name"] == "Test Barbearia"
    assert tenant["plan"] == "trial"


def test_tenant_slug_unique(supabase_url, supabase_headers, test_tenant):
    """Inserting a duplicate public_slug should fail with conflict."""
    resp = requests.post(
        f"{supabase_url}/rest/v1/tenants",
        headers=supabase_headers,
        json={
            "name": "Duplicate Slug Test",
            "plan": "trial",
            "public_slug": "test-barberflow-e2e",
        },
    )
    assert resp.status_code == 409, f"Expected 409, got {resp.status_code}: {resp.text}"
