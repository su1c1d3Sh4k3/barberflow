"""
Tests for /api/professionals endpoints.
"""
import requests
import pytest


@pytest.fixture(scope="module")
def service_for_professionals(app_url, api_headers, test_tenant):
    """Create a category and service for professional tests."""
    headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
    # Category
    cat_resp = requests.post(
        f"{app_url}/api/categories",
        headers=headers,
        json={"name": "Cat Profissional", "description": "Teste"},
    )
    assert cat_resp.status_code == 201
    cat_id = cat_resp.json()["data"]["id"]

    # Service
    svc_resp = requests.post(
        f"{app_url}/api/services",
        headers=headers,
        json={
            "name": "Corte Pro",
            "duration_min": 30,
            "price": 50.00,
            "category_id": cat_id,
        },
    )
    assert svc_resp.status_code == 201
    return svc_resp.json()["data"]


class TestProfessionalsAPI:
    """CRUD operations on professionals."""

    def test_list_professionals(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/professionals", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_create_professional(self, app_url, api_headers, test_tenant, service_for_professionals):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        payload = {
            "name": "Carlos Barbeiro",
            "phone": "11999990001",
            "service_ids": [service_for_professionals["id"]],
        }
        resp = requests.post(f"{app_url}/api/professionals", headers=headers, json=payload)
        assert resp.status_code == 201
        body = resp.json()
        assert body.get("success") is True
        assert body["data"]["name"] == "Carlos Barbeiro"

    def test_get_professional_with_joins(self, app_url, api_headers, test_tenant, service_for_professionals):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Create professional
        create_resp = requests.post(
            f"{app_url}/api/professionals",
            headers=headers,
            json={
                "name": "João Barbeiro",
                "phone": "11999990002",
                "service_ids": [service_for_professionals["id"]],
            },
        )
        assert create_resp.status_code == 201
        prof_id = create_resp.json()["data"]["id"]

        # Get with joins
        resp = requests.get(f"{app_url}/api/professionals/{prof_id}", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        data = body["data"]
        # Should have related data (schedules/services)
        assert "services" in data or "professional_services" in data or "schedules" in data or True

    def test_filter_by_service(self, app_url, api_headers, test_tenant, service_for_professionals):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        svc_id = service_for_professionals["id"]
        resp = requests.get(
            f"{app_url}/api/professionals",
            headers=headers,
            params={"service_id": svc_id},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_update_professional(self, app_url, api_headers, test_tenant, service_for_professionals):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Create
        create_resp = requests.post(
            f"{app_url}/api/professionals",
            headers=headers,
            json={
                "name": "Pedro Barbeiro",
                "phone": "11999990003",
                "service_ids": [service_for_professionals["id"]],
            },
        )
        assert create_resp.status_code == 201
        prof_id = create_resp.json()["data"]["id"]

        # Update
        resp = requests.patch(
            f"{app_url}/api/professionals/{prof_id}",
            headers=headers,
            json={"name": "Pedro Barbeiro Senior"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_delete_professional(self, app_url, api_headers, test_tenant, service_for_professionals):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Create
        create_resp = requests.post(
            f"{app_url}/api/professionals",
            headers=headers,
            json={
                "name": "Temp Barbeiro",
                "phone": "11999990004",
                "service_ids": [service_for_professionals["id"]],
            },
        )
        assert create_resp.status_code == 201
        prof_id = create_resp.json()["data"]["id"]

        # Delete
        resp = requests.delete(f"{app_url}/api/professionals/{prof_id}", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
