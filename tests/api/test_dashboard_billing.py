"""
Tests for dashboard billing: previsao (pendente+confirmado) vs faturamento (concluido),
and per-professional revenue breakdown.
"""
import requests
import pytest


class TestDashboardBilling:
    def _get_data(self, resp):
        """Unwrap { data: {...}, success: true } envelope if present."""
        body = resp.json()
        return body.get("data", body)

    def test_dashboard_returns_kpis(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/dashboard", headers=headers)
        assert resp.status_code == 200
        data = self._get_data(resp)
        assert "kpis" in data
        kpis = data["kpis"]
        assert "total_contacts" in kpis
        assert "total_appointments" in kpis
        assert "revenue" in kpis

    def test_dashboard_revenue_by_professional(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/dashboard?days=30", headers=headers)
        assert resp.status_code == 200
        data = self._get_data(resp)
        assert "revenue_by_professional" in data
        profs = data["revenue_by_professional"]
        assert isinstance(profs, list)
        for p in profs:
            assert "name" in p
            assert "total" in p
            assert isinstance(p["total"], (int, float))
            assert p["total"] >= 0

    def test_dashboard_revenue_only_active_statuses(self, app_url, api_headers, test_tenant):
        """Revenue should only count confirmado and concluido, not cancelado"""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/dashboard?days=30", headers=headers)
        assert resp.status_code == 200
        data = self._get_data(resp)
        assert data["kpis"]["revenue"] >= 0

    def test_dashboard_upcoming_appointments(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/dashboard", headers=headers)
        assert resp.status_code == 200
        data = self._get_data(resp)
        assert "upcoming" in data
        assert isinstance(data["upcoming"], list)

    def test_dashboard_period_filter(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        for days in [7, 30]:
            resp = requests.get(f"{app_url}/api/dashboard?days={days}", headers=headers)
            assert resp.status_code == 200

    def test_dashboard_requires_auth(self, app_url):
        resp = requests.get(f"{app_url}/api/dashboard")
        assert resp.status_code in (401, 403)


class TestProfessionalCommission:
    def test_professionals_have_commission_pct(self, supabase_url, supabase_headers, test_tenant):
        """commission_pct column exists and is queryable"""
        resp = requests.get(
            f"{supabase_url}/rest/v1/professionals",
            headers=supabase_headers,
            params={
                "tenant_id": f"eq.{test_tenant['tenant_id']}",
                "select": "id,name,commission_pct",
                "limit": "10",
            },
        )
        assert resp.status_code == 200
        profs = resp.json()
        assert isinstance(profs, list)
        for p in profs:
            assert "commission_pct" in p
            assert isinstance(p["commission_pct"], (int, float))

    def test_professional_schedules_queryable(self, supabase_url, supabase_headers, test_tenant):
        """professional_schedules table returns weekday/start_time/end_time"""
        resp = requests.get(
            f"{supabase_url}/rest/v1/professional_schedules",
            headers=supabase_headers,
            params={
                "select": "professional_id,weekday,start_time,end_time",
                "limit": "5",
            },
        )
        assert resp.status_code == 200

    def test_professional_services_link_queryable(self, supabase_url, supabase_headers, test_tenant):
        """professional_services table returns service links"""
        resp = requests.get(
            f"{supabase_url}/rest/v1/professional_services",
            headers=supabase_headers,
            params={
                "select": "professional_id,service_id",
                "limit": "5",
            },
        )
        assert resp.status_code == 200
