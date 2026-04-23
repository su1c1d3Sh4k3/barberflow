"""
Tests for multi-unit (company_id) filtering on services, professionals,
and the public booking endpoint.
"""
import requests
import pytest


class TestServicesCompanyFilter:
    """GET /api/services?company_id= filters services by branch."""

    def test_services_without_company_id_returns_all(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/services", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert isinstance(body.get("data"), list)

    def test_services_with_invalid_company_id_returns_empty(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = requests.get(f"{app_url}/api/services?company_id={fake_id}", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        # No professionals at fake company → empty list
        assert body.get("data") == []

    def test_services_company_id_param_accepted(self, app_url, api_headers, test_tenant):
        """company_id param is accepted (no 400/500 error)."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Use a well-formed UUID; may return empty or results depending on data
        resp = requests.get(
            f"{app_url}/api/services?company_id=00000000-0000-0000-0000-000000000001",
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json().get("success") is True


class TestProfessionalsCompanyFilter:
    """GET /api/professionals?company_id= filters professionals by branch."""

    def test_professionals_without_company_id_returns_all(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/professionals", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert isinstance(body.get("data"), list)

    def test_professionals_with_invalid_company_id_returns_empty(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = requests.get(f"{app_url}/api/professionals?company_id={fake_id}", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert body.get("data") == []

    def test_professionals_company_id_param_accepted(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(
            f"{app_url}/api/professionals?company_id=00000000-0000-0000-0000-000000000001",
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json().get("success") is True


class TestBookingSlugFiltering:
    """Public booking endpoint /api/booking/[slug] filters by company."""

    def test_categories_step_returns_list(self, app_url, test_tenant):
        """categories step must return a list (even if empty for unknown slug)."""
        slug = test_tenant.get("slug") or "unknown-slug-xyz"
        resp = requests.get(f"{app_url}/api/booking/{slug}?step=categories")
        # Either 200 with categories or 404 if slug doesn't exist
        assert resp.status_code in (200, 404)
        if resp.status_code == 200:
            body = resp.json()
            assert "categories" in body
            assert isinstance(body["categories"], list)

    def test_categories_404_for_nonexistent_slug(self, app_url):
        resp = requests.get(f"{app_url}/api/booking/slug-nao-existe-xyz123?step=categories")
        assert resp.status_code == 404

    def test_services_step_requires_category_id(self, app_url, test_tenant):
        slug = test_tenant.get("slug") or "unknown-slug-xyz"
        resp = requests.get(f"{app_url}/api/booking/{slug}?step=services")
        # Either 400 (missing category_id) or 404 (slug not found)
        assert resp.status_code in (400, 404)

    def test_professionals_step_requires_service_id(self, app_url, test_tenant):
        slug = test_tenant.get("slug") or "unknown-slug-xyz"
        resp = requests.get(f"{app_url}/api/booking/{slug}?step=professionals")
        assert resp.status_code in (400, 404)

    def test_invalid_step_returns_400(self, app_url, test_tenant):
        slug = test_tenant.get("slug") or "unknown-slug-xyz"
        resp = requests.get(f"{app_url}/api/booking/{slug}?step=invalid_step")
        assert resp.status_code in (400, 404)
