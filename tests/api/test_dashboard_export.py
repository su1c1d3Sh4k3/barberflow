"""
Tests for dashboard export data — day_of_week and revenue_by_professional.
"""
import requests
import pytest


class TestDashboardDayOfWeek:
    """Verify dashboard returns real appointments_by_day_of_week data."""

    def test_day_of_week_returns_array_of_7(self, app_url, api_headers, test_tenant):
        """GET /api/dashboard should return appointments_by_day_of_week as array of 7 ints."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/dashboard", headers=headers)
        assert resp.status_code == 200
        data = resp.json().get("data", {})
        dow = data.get("appointments_by_day_of_week")
        assert dow is not None, "Missing appointments_by_day_of_week"
        assert isinstance(dow, list)
        assert len(dow) == 7
        for v in dow:
            assert isinstance(v, int)
            assert v >= 0

    def test_day_of_week_sums_match_total(self, app_url, api_headers, test_tenant):
        """Sum of day_of_week counts should match total appointments."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/dashboard?days=30", headers=headers)
        assert resp.status_code == 200
        data = resp.json().get("data", {})
        dow = data.get("appointments_by_day_of_week", [])
        total = data.get("kpis", {}).get("total_appointments", 0)
        assert sum(dow) == total

    def test_day_of_week_with_period_filter(self, app_url, api_headers, test_tenant):
        """Day of week data should respect period filter."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp7 = requests.get(f"{app_url}/api/dashboard?days=7", headers=headers)
        resp30 = requests.get(f"{app_url}/api/dashboard?days=30", headers=headers)
        assert resp7.status_code == 200
        assert resp30.status_code == 200
        dow7 = resp7.json().get("data", {}).get("appointments_by_day_of_week", [])
        dow30 = resp30.json().get("data", {}).get("appointments_by_day_of_week", [])
        assert len(dow7) == 7
        assert len(dow30) == 7
        # 30-day totals should be >= 7-day totals
        assert sum(dow30) >= sum(dow7)


class TestDashboardRevenueByProfessional:
    """Verify dashboard returns revenue_by_professional data."""

    def test_revenue_by_professional_exists(self, app_url, api_headers, test_tenant):
        """GET /api/dashboard should return revenue_by_professional array."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/dashboard", headers=headers)
        assert resp.status_code == 200
        data = resp.json().get("data", {})
        rbp = data.get("revenue_by_professional")
        assert rbp is not None, "Missing revenue_by_professional"
        assert isinstance(rbp, list)

    def test_revenue_by_professional_structure(self, app_url, api_headers, test_tenant):
        """Each entry should have name (str) and total (number)."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/dashboard", headers=headers)
        assert resp.status_code == 200
        data = resp.json().get("data", {})
        rbp = data.get("revenue_by_professional", [])
        for entry in rbp:
            assert "name" in entry, "Missing 'name' field"
            assert "total" in entry, "Missing 'total' field"
            assert isinstance(entry["name"], str)
            assert isinstance(entry["total"], (int, float))
            assert entry["total"] >= 0

    def test_revenue_by_professional_sorted_desc(self, app_url, api_headers, test_tenant):
        """Revenue by professional should be sorted descending by total."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/dashboard", headers=headers)
        assert resp.status_code == 200
        rbp = resp.json().get("data", {}).get("revenue_by_professional", [])
        if len(rbp) > 1:
            for i in range(len(rbp) - 1):
                assert rbp[i]["total"] >= rbp[i + 1]["total"]


class TestDashboardExportData:
    """Verify dashboard returns appointments_for_export data."""

    def test_export_data_exists(self, app_url, api_headers, test_tenant):
        """GET /api/dashboard should return appointments_for_export array."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/dashboard", headers=headers)
        assert resp.status_code == 200
        data = resp.json().get("data", {})
        export = data.get("appointments_for_export")
        assert export is not None, "Missing appointments_for_export"
        assert isinstance(export, list)

    def test_export_data_structure(self, app_url, api_headers, test_tenant):
        """Each export entry should have date, client, service, professional, status, value."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/dashboard", headers=headers)
        assert resp.status_code == 200
        export = resp.json().get("data", {}).get("appointments_for_export", [])
        expected_keys = {"date", "client", "service", "professional", "status", "value"}
        for entry in export:
            assert expected_keys.issubset(set(entry.keys())), f"Missing keys: {expected_keys - set(entry.keys())}"
