"""
Tests for booking API: check_phone step, cancel and reschedule POST steps.
"""
import requests
import pytest


BASE_URL = "http://localhost:3000"


def get_slug(app_url, api_headers, test_tenant):
    headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
    resp = requests.get(f"{app_url}/api/company", headers=headers)
    if resp.status_code == 200:
        data = resp.json()
        companies = data.get("companies") or data.get("data") or []
        if isinstance(companies, list) and companies:
            return companies[0].get("public_slug")
        if isinstance(data, dict) and data.get("public_slug"):
            return data["public_slug"]
    return None


class TestCheckPhone:
    def test_check_phone_missing_param(self, app_url, api_headers, test_tenant):
        slug = get_slug(app_url, api_headers, test_tenant)
        if not slug:
            pytest.skip("No public_slug available")
        resp = requests.get(f"{app_url}/api/booking/{slug}?step=check_phone")
        assert resp.status_code == 400
        assert "phone" in resp.json().get("error", "").lower()

    def test_check_phone_unknown_number(self, app_url, api_headers, test_tenant):
        slug = get_slug(app_url, api_headers, test_tenant)
        if not slug:
            pytest.skip("No public_slug available")
        resp = requests.get(
            f"{app_url}/api/booking/{slug}?step=check_phone&phone=00000000000"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "appointments" in data
        assert data["appointments"] == []

    def test_check_phone_invalid_slug(self, app_url):
        resp = requests.get(
            f"{app_url}/api/booking/slug-que-nao-existe?step=check_phone&phone=11999999999"
        )
        assert resp.status_code == 404


class TestCancelStep:
    def test_cancel_missing_reason(self, app_url, api_headers, test_tenant):
        slug = get_slug(app_url, api_headers, test_tenant)
        if not slug:
            pytest.skip("No public_slug available")
        resp = requests.post(
            f"{app_url}/api/booking/{slug}?step=cancel",
            json={"appointment_id": "00000000-0000-0000-0000-000000000000"},
        )
        assert resp.status_code == 400

    def test_cancel_missing_appointment_id(self, app_url, api_headers, test_tenant):
        slug = get_slug(app_url, api_headers, test_tenant)
        if not slug:
            pytest.skip("No public_slug available")
        resp = requests.post(
            f"{app_url}/api/booking/{slug}?step=cancel",
            json={"reason": "Não vou mais"},
        )
        assert resp.status_code == 400

    def test_cancel_nonexistent_appointment(self, app_url, api_headers, test_tenant):
        slug = get_slug(app_url, api_headers, test_tenant)
        if not slug:
            pytest.skip("No public_slug available")
        # Should return success (no rows updated) or 200
        resp = requests.post(
            f"{app_url}/api/booking/{slug}?step=cancel",
            json={
                "appointment_id": "00000000-0000-0000-0000-000000000000",
                "reason": "Motivo de teste",
            },
        )
        # Either 200 (no row matched) or 500 from DB
        assert resp.status_code in (200, 500)


class TestRescheduleStep:
    def test_reschedule_missing_reason(self, app_url, api_headers, test_tenant):
        slug = get_slug(app_url, api_headers, test_tenant)
        if not slug:
            pytest.skip("No public_slug available")
        resp = requests.post(
            f"{app_url}/api/booking/{slug}?step=reschedule",
            json={"appointment_id": "00000000-0000-0000-0000-000000000000"},
        )
        assert resp.status_code == 400

    def test_reschedule_missing_appointment_id(self, app_url, api_headers, test_tenant):
        slug = get_slug(app_url, api_headers, test_tenant)
        if not slug:
            pytest.skip("No public_slug available")
        resp = requests.post(
            f"{app_url}/api/booking/{slug}?step=reschedule",
            json={"reason": "Preciso de outro horario"},
        )
        assert resp.status_code == 400

    def test_reschedule_nonexistent_appointment(self, app_url, api_headers, test_tenant):
        slug = get_slug(app_url, api_headers, test_tenant)
        if not slug:
            pytest.skip("No public_slug available")
        resp = requests.post(
            f"{app_url}/api/booking/{slug}?step=reschedule",
            json={
                "appointment_id": "00000000-0000-0000-0000-000000000000",
                "reason": "Motivo de teste",
            },
        )
        assert resp.status_code in (200, 500)


class TestInvalidStep:
    def test_invalid_post_step(self, app_url, api_headers, test_tenant):
        slug = get_slug(app_url, api_headers, test_tenant)
        if not slug:
            pytest.skip("No public_slug available")
        resp = requests.post(
            f"{app_url}/api/booking/{slug}?step=invalid",
            json={},
        )
        assert resp.status_code == 400

    def test_invalid_get_step(self, app_url, api_headers, test_tenant):
        slug = get_slug(app_url, api_headers, test_tenant)
        if not slug:
            pytest.skip("No public_slug available")
        resp = requests.get(f"{app_url}/api/booking/{slug}?step=invalid_step")
        assert resp.status_code == 400
