"""
Tests for utility API endpoints:
- /api/business-hours
- /api/company
- /api/promotions
- /api/messages
- /api/waitlist
- /api/coupons
"""
import requests
import pytest


class TestUtilityAPI:
    """Miscellaneous utility endpoints."""

    def test_business_hours_today(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/business-hours/today", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_company_info(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/company/info", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_active_promotions(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/promotions/active", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_log_message(self, app_url, api_headers, test_tenant, supabase_url, supabase_headers):
        tenant_id = test_tenant["tenant_id"]
        headers = {**api_headers, "x-tenant-id": tenant_id}
        # Need a contact for the message
        contact_resp = requests.post(
            f"{supabase_url}/rest/v1/contacts",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "name": "Msg Test", "phone": "5511988883001"},
        )
        contact = contact_resp.json()[0] if isinstance(contact_resp.json(), list) else contact_resp.json()
        payload = {
            "contact_id": contact["id"],
            "direction": "inbound",
            "content": "Olá, gostaria de agendar um corte",
        }
        resp = requests.post(f"{app_url}/api/messages/log", headers=headers, json=payload)
        assert resp.status_code == 201
        body = resp.json()
        assert body.get("success") is True

    def test_waitlist(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        payload = {
            "preferred_date": "2026-05-01",
        }
        resp = requests.post(f"{app_url}/api/waitlist", headers=headers, json=payload)
        assert resp.status_code == 201
        body = resp.json()
        assert body.get("success") is True

    def test_validate_coupon(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        payload = {"code": "INVALID_COUPON_XYZ"}
        resp = requests.post(f"{app_url}/api/coupons/validate", headers=headers, json=payload)
        # Should be 404 for non-existent or 200 with valid=false
        assert resp.status_code in (200, 404)
        body = resp.json()
        if resp.status_code == 200:
            assert body.get("success") is True

    def test_generate_coupon(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        payload = {
            "discount_type": "percentage",
            "discount_value": 10,
            "max_uses": 5,
        }
        resp = requests.post(f"{app_url}/api/coupons/generate", headers=headers, json=payload)
        assert resp.status_code == 201
        body = resp.json()
        assert body.get("success") is True
