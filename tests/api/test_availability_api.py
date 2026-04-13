"""
Tests for /api/availability endpoints.
"""
import requests
import pytest
from datetime import date, timedelta


@pytest.fixture(scope="module")
def availability_data(app_url, api_headers, test_tenant):
    """Create a professional and service for availability tests."""
    headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

    # Category
    cat_resp = requests.post(
        f"{app_url}/api/categories",
        headers=headers,
        json={"name": "Cat Availability", "description": "Teste"},
    )
    assert cat_resp.status_code == 201
    cat_id = cat_resp.json()["data"]["id"]

    # Service
    svc_resp = requests.post(
        f"{app_url}/api/services",
        headers=headers,
        json={
            "name": "Corte Availability",
            "duration_min": 30,
            "price": 40.00,
            "category_id": cat_id,
        },
    )
    assert svc_resp.status_code == 201
    service = svc_resp.json()["data"]

    # Professional
    prof_resp = requests.post(
        f"{app_url}/api/professionals",
        headers=headers,
        json={
            "name": "Barbeiro Availability",
            "phone": "11999991001",
            "service_ids": [service["id"]],
        },
    )
    assert prof_resp.status_code == 201
    professional = prof_resp.json()["data"]

    return {"service": service, "professional": professional}


class TestAvailabilityAPI:
    """Availability slot queries."""

    def test_get_slots(self, app_url, api_headers, test_tenant, availability_data):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Use a date in the near future
        future_date = (date.today() + timedelta(days=1)).isoformat()
        params = {
            "professional_id": availability_data["professional"]["id"],
            "service_id": availability_data["service"]["id"],
            "date": future_date,
        }
        resp = requests.get(f"{app_url}/api/availability", headers=headers, params=params)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert "slots" in body.get("data", body) or "data" in body

    def test_check_slot(self, app_url, api_headers, test_tenant, availability_data):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        future_date = (date.today() + timedelta(days=1)).isoformat()
        start_at = f"{future_date}T10:00:00"
        params = {
            "professional_id": availability_data["professional"]["id"],
            "service_id": availability_data["service"]["id"],
            "date_time": start_at,
        }
        resp = requests.get(
            f"{app_url}/api/availability/check-slot", headers=headers, params=params
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_next_available(self, app_url, api_headers, test_tenant, availability_data):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        params = {
            "service_id": availability_data["service"]["id"],
            "professional_id": availability_data["professional"]["id"],
        }
        resp = requests.get(
            f"{app_url}/api/availability/next-available", headers=headers, params=params
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_missing_params(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/availability", headers=headers)
        assert resp.status_code == 400
        body = resp.json()
        assert body.get("success") is False or "error" in body
