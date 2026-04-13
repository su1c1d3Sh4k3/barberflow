"""
Tests for /api/contacts endpoints.
"""
import requests
import pytest


class TestContactsAPI:
    """CRUD operations on contacts."""

    def test_list_contacts(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/contacts", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_create_contact(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        payload = {
            "name": "João Cliente",
            "phone": "5511988880001",
        }
        resp = requests.post(f"{app_url}/api/contacts", headers=headers, json=payload)
        assert resp.status_code == 201
        body = resp.json()
        assert body.get("success") is True
        assert body["data"]["name"] == "João Cliente"

    def test_get_contact(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Create
        create_resp = requests.post(
            f"{app_url}/api/contacts",
            headers=headers,
            json={"name": "Maria Cliente", "phone": "5511988880002"},
        )
        assert create_resp.status_code == 201
        contact_id = create_resp.json()["data"]["id"]

        # Get
        resp = requests.get(f"{app_url}/api/contacts/{contact_id}", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert body["data"]["id"] == contact_id

    def test_get_by_phone(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Create
        phone = "5511988880003"
        requests.post(
            f"{app_url}/api/contacts",
            headers=headers,
            json={"name": "Pedro Cliente", "phone": phone},
        )

        # Get by phone
        resp = requests.get(f"{app_url}/api/contacts/by-phone/{phone}", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_contact_appointments(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Create contact
        create_resp = requests.post(
            f"{app_url}/api/contacts",
            headers=headers,
            json={"name": "Ana Cliente", "phone": "5511988880004"},
        )
        assert create_resp.status_code == 201
        contact_id = create_resp.json()["data"]["id"]

        # Get appointments
        resp = requests.get(
            f"{app_url}/api/contacts/{contact_id}/appointments", headers=headers
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_contact_messages(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Create contact
        create_resp = requests.post(
            f"{app_url}/api/contacts",
            headers=headers,
            json={"name": "Lucas Cliente", "phone": "5511988880005"},
        )
        assert create_resp.status_code == 201
        contact_id = create_resp.json()["data"]["id"]

        # Get messages
        resp = requests.get(
            f"{app_url}/api/contacts/{contact_id}/messages", headers=headers
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_update_contact(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Create
        create_resp = requests.post(
            f"{app_url}/api/contacts",
            headers=headers,
            json={"name": "Update Cliente", "phone": "5511988880006"},
        )
        assert create_resp.status_code == 201
        contact_id = create_resp.json()["data"]["id"]

        # Update
        resp = requests.patch(
            f"{app_url}/api/contacts/{contact_id}",
            headers=headers,
            json={"name": "Update Cliente Editado"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_delete_contact(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Create
        create_resp = requests.post(
            f"{app_url}/api/contacts",
            headers=headers,
            json={"name": "Delete Cliente", "phone": "5511988880007"},
        )
        assert create_resp.status_code == 201
        contact_id = create_resp.json()["data"]["id"]

        # Delete
        resp = requests.delete(f"{app_url}/api/contacts/{contact_id}", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
