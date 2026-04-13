"""
Tests for /api/dashboard endpoint — aggregated dashboard data.
"""
import requests
import pytest


class TestDashboardAPI:
    """Verify dashboard data aggregation endpoint."""

    def test_dashboard_requires_auth(self, app_url):
        """GET /api/dashboard without auth should return 401."""
        resp = requests.get(f"{app_url}/api/dashboard")
        assert resp.status_code == 401

    def test_dashboard_returns_kpis(self, app_url, api_headers, test_tenant):
        """GET /api/dashboard should return KPI data."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/dashboard", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        data = body.get("data", {})
        assert "kpis" in data
        kpis = data["kpis"]
        assert "total_contacts" in kpis
        assert "total_appointments" in kpis
        assert "conversion_rate" in kpis
        assert "revenue" in kpis
        assert isinstance(kpis["total_contacts"], int)
        assert isinstance(kpis["revenue"], (int, float))

    def test_dashboard_returns_status_breakdown(self, app_url, api_headers, test_tenant):
        """GET /api/dashboard should return appointment status breakdown."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/dashboard", headers=headers)
        assert resp.status_code == 200
        data = resp.json().get("data", {})
        assert "status_breakdown" in data
        assert isinstance(data["status_breakdown"], dict)

    def test_dashboard_returns_day_of_week(self, app_url, api_headers, test_tenant):
        """GET /api/dashboard should return appointments by day of week."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/dashboard", headers=headers)
        assert resp.status_code == 200
        data = resp.json().get("data", {})
        assert "appointments_by_day_of_week" in data
        dow = data["appointments_by_day_of_week"]
        assert isinstance(dow, list)
        assert len(dow) == 7

    def test_dashboard_returns_whatsapp_status(self, app_url, api_headers, test_tenant):
        """GET /api/dashboard should return WhatsApp connection status."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/dashboard", headers=headers)
        assert resp.status_code == 200
        data = resp.json().get("data", {})
        assert "whatsapp" in data
        assert "connected" in data["whatsapp"]

    def test_dashboard_returns_upcoming(self, app_url, api_headers, test_tenant):
        """GET /api/dashboard should return upcoming appointments."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/dashboard", headers=headers)
        assert resp.status_code == 200
        data = resp.json().get("data", {})
        assert "upcoming" in data
        assert isinstance(data["upcoming"], list)

    def test_dashboard_period_filter(self, app_url, api_headers, test_tenant):
        """GET /api/dashboard?days=7 should filter by period."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp7 = requests.get(f"{app_url}/api/dashboard?days=7", headers=headers)
        resp30 = requests.get(f"{app_url}/api/dashboard?days=30", headers=headers)
        assert resp7.status_code == 200
        assert resp30.status_code == 200
        # Both should return valid data
        assert resp7.json().get("success") is True
        assert resp30.json().get("success") is True

    def test_dashboard_kpi_values_non_negative(self, app_url, api_headers, test_tenant):
        """All KPI values should be non-negative."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/dashboard", headers=headers)
        kpis = resp.json().get("data", {}).get("kpis", {})
        assert kpis.get("total_contacts", 0) >= 0
        assert kpis.get("total_appointments", 0) >= 0
        assert kpis.get("conversion_rate", 0) >= 0
        assert kpis.get("revenue", 0) >= 0
