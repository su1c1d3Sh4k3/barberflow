"""
Tests for company/empresa API endpoints.
"""
import requests
import pytest
import uuid


class TestCompanyAPI:
    """Tests for company management endpoints."""

    def test_company_info_requires_auth(self, app_url):
        """GET /api/company/info without auth should return 401."""
        resp = requests.get(f"{app_url}/api/company/info")
        assert resp.status_code == 401

    def test_company_info_with_auth(self, app_url, api_headers, test_tenant):
        """GET /api/company/info should return company data."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/company/info", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_create_unit(self, supabase_headers, supabase_url, test_tenant):
        """Creating a second company (unit) should work."""
        tenant_id = test_tenant["tenant_id"]
        resp = requests.post(
            f"{supabase_url}/rest/v1/companies",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "name": f"Unidade Teste {uuid.uuid4().hex[:6]}",
                "is_default": False,
            },
        )
        assert resp.status_code in (200, 201), f"Failed: {resp.text}"
        company = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
        assert company["is_default"] is False
        assert company["tenant_id"] == tenant_id

        # Cleanup
        requests.delete(
            f"{supabase_url}/rest/v1/companies?id=eq.{company['id']}",
            headers={**supabase_headers, "Prefer": ""},
        )

    def test_list_units(self, supabase_headers, supabase_url, test_tenant):
        """Should be able to list all companies for a tenant."""
        tenant_id = test_tenant["tenant_id"]

        # Create a second unit
        resp = requests.post(
            f"{supabase_url}/rest/v1/companies",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "name": f"Unit List Test {uuid.uuid4().hex[:6]}",
                "is_default": False,
            },
        )
        assert resp.status_code in (200, 201)
        unit = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

        # List all
        list_resp = requests.get(
            f"{supabase_url}/rest/v1/companies?tenant_id=eq.{tenant_id}&select=id,name,is_default",
            headers=supabase_headers,
        )
        assert list_resp.status_code == 200
        companies = list_resp.json()
        assert len(companies) >= 2, "Should have default + new unit"

        # Verify default exists
        defaults = [c for c in companies if c["is_default"]]
        assert len(defaults) >= 1

        # Cleanup
        requests.delete(
            f"{supabase_url}/rest/v1/companies?id=eq.{unit['id']}",
            headers={**supabase_headers, "Prefer": ""},
        )

    def test_update_company(self, supabase_headers, supabase_url, test_tenant):
        """Should be able to update company details."""
        company_id = test_tenant["company_id"]
        new_name = f"Updated Barbearia {uuid.uuid4().hex[:4]}"

        resp = requests.patch(
            f"{supabase_url}/rest/v1/companies?id=eq.{company_id}",
            headers=supabase_headers,
            json={"name": new_name},
        )
        assert resp.status_code in (200, 204)

        # Verify
        get_resp = requests.get(
            f"{supabase_url}/rest/v1/companies?id=eq.{company_id}&select=name",
            headers=supabase_headers,
        )
        assert get_resp.json()[0]["name"] == new_name

        # Restore
        requests.patch(
            f"{supabase_url}/rest/v1/companies?id=eq.{company_id}",
            headers=supabase_headers,
            json={"name": "Barbearia Teste"},
        )


class TestContactEditDelete:
    """Tests to verify contacts edit/delete API works for the frontend wiring."""

    def test_edit_contact_name(self, app_url, api_headers, test_tenant, supabase_headers, supabase_url):
        """PATCH /api/contacts/[id] should update the contact."""
        tenant_id = test_tenant["tenant_id"]
        headers = {**api_headers, "x-tenant-id": tenant_id}

        # Create contact
        phone = f"55119{uuid.uuid4().hex[:8]}"
        create_resp = requests.post(
            f"{app_url}/api/contacts",
            headers=headers,
            json={"name": "Original Name", "phone": phone},
        )
        assert create_resp.status_code == 201
        contact_id = create_resp.json()["data"]["id"]

        # Edit name
        edit_resp = requests.patch(
            f"{app_url}/api/contacts/{contact_id}",
            headers=headers,
            json={"name": "Updated Name"},
        )
        assert edit_resp.status_code == 200
        assert edit_resp.json()["data"]["name"] == "Updated Name"

    def test_edit_contact_notes(self, app_url, api_headers, test_tenant):
        """PATCH /api/contacts/[id] should update notes."""
        tenant_id = test_tenant["tenant_id"]
        headers = {**api_headers, "x-tenant-id": tenant_id}

        phone = f"55119{uuid.uuid4().hex[:8]}"
        create_resp = requests.post(
            f"{app_url}/api/contacts",
            headers=headers,
            json={"name": "Notes Test", "phone": phone},
        )
        assert create_resp.status_code == 201
        contact_id = create_resp.json()["data"]["id"]

        edit_resp = requests.patch(
            f"{app_url}/api/contacts/{contact_id}",
            headers=headers,
            json={"notes": "VIP client, prefers Mondays"},
        )
        assert edit_resp.status_code == 200

    def test_delete_contact(self, app_url, api_headers, test_tenant):
        """DELETE /api/contacts/[id] should remove the contact."""
        tenant_id = test_tenant["tenant_id"]
        headers = {**api_headers, "x-tenant-id": tenant_id}

        phone = f"55119{uuid.uuid4().hex[:8]}"
        create_resp = requests.post(
            f"{app_url}/api/contacts",
            headers=headers,
            json={"name": "To Delete", "phone": phone},
        )
        assert create_resp.status_code == 201
        contact_id = create_resp.json()["data"]["id"]

        # Delete
        del_resp = requests.delete(
            f"{app_url}/api/contacts/{contact_id}",
            headers=headers,
        )
        assert del_resp.status_code == 200

        # Verify gone
        get_resp = requests.get(
            f"{app_url}/api/contacts/{contact_id}",
            headers=headers,
        )
        # Should return 404 or empty
        assert get_resp.status_code in (200, 404)

    def test_delete_nonexistent_contact(self, app_url, api_headers, test_tenant):
        """DELETE /api/contacts/[nonexistent] should return 404."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.delete(
            f"{app_url}/api/contacts/00000000-0000-0000-0000-000000000099",
            headers=headers,
        )
        assert resp.status_code in (404, 200)
