"""
Tests for /api/categories endpoints.
"""
import requests
import pytest


class TestCategoriesAPI:
    """CRUD operations on service categories."""

    def test_list_categories(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/categories", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_create_category(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        payload = {"name": "Cortes", "description": "Cortes de cabelo"}
        resp = requests.post(f"{app_url}/api/categories", headers=headers, json=payload)
        assert resp.status_code == 201
        body = resp.json()
        assert body.get("success") is True
        assert "data" in body

    def test_get_category(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Create a category first
        payload = {"name": "Barba", "description": "Serviços de barba"}
        create_resp = requests.post(f"{app_url}/api/categories", headers=headers, json=payload)
        assert create_resp.status_code == 201
        cat_id = create_resp.json()["data"]["id"]

        resp = requests.get(f"{app_url}/api/categories/{cat_id}", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert body["data"]["id"] == cat_id

    def test_update_category(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Create
        create_resp = requests.post(
            f"{app_url}/api/categories",
            headers=headers,
            json={"name": "Tratamentos", "description": "Tratamentos capilares"},
        )
        assert create_resp.status_code == 201
        cat_id = create_resp.json()["data"]["id"]

        # Update
        resp = requests.patch(
            f"{app_url}/api/categories/{cat_id}",
            headers=headers,
            json={"name": "Tratamentos Premium"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_delete_category(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Create
        create_resp = requests.post(
            f"{app_url}/api/categories",
            headers=headers,
            json={"name": "Temporário", "description": "Para deletar"},
        )
        assert create_resp.status_code == 201
        cat_id = create_resp.json()["data"]["id"]

        # Delete
        resp = requests.delete(f"{app_url}/api/categories/{cat_id}", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_unauthorized(self, app_url, test_tenant):
        headers = {"Content-Type": "application/json", "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/categories", headers=headers)
        assert resp.status_code == 401
