"""
Tests for /api/services endpoints.
"""
import requests
import pytest


@pytest.fixture(scope="module")
def category_for_services(app_url, api_headers, test_tenant):
    """Create a category to associate services with."""
    headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
    resp = requests.post(
        f"{app_url}/api/categories",
        headers=headers,
        json={"name": "Categoria Serviços Test", "description": "Para testes de serviços"},
    )
    assert resp.status_code == 201
    return resp.json()["data"]


class TestServicesAPI:
    """CRUD operations on services."""

    def test_list_services(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/services", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_create_service(self, app_url, api_headers, test_tenant, category_for_services):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        payload = {
            "name": "Corte Masculino",
            "duration_min": 30,
            "price": 45.00,
            "category_id": category_for_services["id"],
        }
        resp = requests.post(f"{app_url}/api/services", headers=headers, json=payload)
        assert resp.status_code == 201
        body = resp.json()
        assert body.get("success") is True
        assert body["data"]["name"] == "Corte Masculino"

    def test_get_service(self, app_url, api_headers, test_tenant, category_for_services):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Create
        create_resp = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={
                "name": "Barba Completa",
                "duration_min": 20,
                "price": 30.00,
                "category_id": category_for_services["id"],
            },
        )
        assert create_resp.status_code == 201
        svc_id = create_resp.json()["data"]["id"]

        resp = requests.get(f"{app_url}/api/services/{svc_id}", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert body["data"]["id"] == svc_id

    def test_filter_by_category(self, app_url, api_headers, test_tenant, category_for_services):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        cat_id = category_for_services["id"]
        resp = requests.get(
            f"{app_url}/api/services",
            headers=headers,
            params={"category_id": cat_id},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_update_service(self, app_url, api_headers, test_tenant, category_for_services):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Create
        create_resp = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={
                "name": "Hidratação",
                "duration_min": 40,
                "price": 60.00,
                "category_id": category_for_services["id"],
            },
        )
        assert create_resp.status_code == 201
        svc_id = create_resp.json()["data"]["id"]

        # Update
        resp = requests.patch(
            f"{app_url}/api/services/{svc_id}",
            headers=headers,
            json={"price": 70.00},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_delete_service(self, app_url, api_headers, test_tenant, category_for_services):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Create
        create_resp = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={
                "name": "Para Deletar",
                "duration_min": 15,
                "price": 20.00,
                "category_id": category_for_services["id"],
            },
        )
        assert create_resp.status_code == 201
        svc_id = create_resp.json()["data"]["id"]

        # Delete
        resp = requests.delete(f"{app_url}/api/services/{svc_id}", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
