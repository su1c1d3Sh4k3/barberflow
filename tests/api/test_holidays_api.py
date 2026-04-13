"""
Tests for /api/holidays endpoint (company holiday management).
"""
import requests
import pytest


class TestHolidaysAPI:
    """Holiday CRUD for companies."""

    def _headers(self, api_headers, test_tenant):
        return {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

    def test_list_requires_auth(self, app_url):
        resp = requests.get(f"{app_url}/api/holidays?company_id=fake")
        assert resp.status_code == 401

    def test_list_requires_company_id(self, app_url, api_headers, test_tenant):
        resp = requests.get(
            f"{app_url}/api/holidays",
            headers=self._headers(api_headers, test_tenant),
        )
        assert resp.status_code == 400

    def test_list_holidays_empty(self, app_url, api_headers, test_tenant):
        resp = requests.get(
            f"{app_url}/api/holidays?company_id={test_tenant['company_id']}",
            headers=self._headers(api_headers, test_tenant),
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_create_holiday(self, app_url, api_headers, test_tenant):
        headers = self._headers(api_headers, test_tenant)
        resp = requests.post(
            f"{app_url}/api/holidays",
            headers=headers,
            json={
                "company_id": test_tenant["company_id"],
                "date": "2026-12-25",
                "name": "Natal",
            },
        )
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
        data = resp.json()["data"]
        assert data["name"] == "Natal"
        assert data["date"] == "2026-12-25"

        # Verify it shows in list
        list_resp = requests.get(
            f"{app_url}/api/holidays?company_id={test_tenant['company_id']}",
            headers=headers,
        )
        holidays = list_resp.json()["data"]
        assert any(h["name"] == "Natal" for h in holidays)

    def test_create_requires_fields(self, app_url, api_headers, test_tenant):
        resp = requests.post(
            f"{app_url}/api/holidays",
            headers=self._headers(api_headers, test_tenant),
            json={"company_id": test_tenant["company_id"]},
        )
        assert resp.status_code == 422

    def test_delete_holiday(self, app_url, api_headers, test_tenant):
        headers = self._headers(api_headers, test_tenant)
        # Create
        create_resp = requests.post(
            f"{app_url}/api/holidays",
            headers=headers,
            json={
                "company_id": test_tenant["company_id"],
                "date": "2026-01-01",
                "name": "Ano Novo",
            },
        )
        assert create_resp.status_code == 201
        holiday_id = create_resp.json()["data"]["id"]

        # Delete
        del_resp = requests.delete(
            f"{app_url}/api/holidays?id={holiday_id}",
            headers=headers,
        )
        assert del_resp.status_code == 200
