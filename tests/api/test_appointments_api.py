"""
Tests for /api/appointments endpoints.
"""
import requests
import pytest
from datetime import date, timedelta, datetime


@pytest.fixture(scope="module")
def appointment_deps(app_url, api_headers, test_tenant):
    """Create contact, professional, and service needed for appointment tests."""
    headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

    # Category
    cat_resp = requests.post(
        f"{app_url}/api/categories",
        headers=headers,
        json={"name": "Cat Appointments", "description": "Teste"},
    )
    assert cat_resp.status_code == 201
    cat_id = cat_resp.json()["data"]["id"]

    # Service
    svc_resp = requests.post(
        f"{app_url}/api/services",
        headers=headers,
        json={
            "name": "Corte Appointment",
            "duration_min": 30,
            "price": 45.00,
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
            "name": "Barbeiro Appointment",
            "phone": "11999992001",
            "service_ids": [service["id"]],
        },
    )
    assert prof_resp.status_code == 201
    professional = prof_resp.json()["data"]

    # Contact
    contact_resp = requests.post(
        f"{app_url}/api/contacts",
        headers=headers,
        json={"name": "Cliente Appointment", "phone": "5511988882001"},
    )
    assert contact_resp.status_code == 201
    contact = contact_resp.json()["data"]

    return {
        "service": service,
        "professional": professional,
        "contact": contact,
    }


def _create_appointment(app_url, headers, deps, days_offset=1, hour=10):
    """Helper to create an appointment."""
    future_date = (date.today() + timedelta(days=days_offset)).isoformat()
    start_at = f"{future_date}T{hour:02d}:00:00"
    end_at = f"{future_date}T{hour:02d}:30:00"
    payload = {
        "contact_id": deps["contact"]["id"],
        "professional_id": deps["professional"]["id"],
        "service_id": deps["service"]["id"],
        "start_at": start_at,
        "end_at": end_at,
    }
    return requests.post(f"{app_url}/api/appointments", headers=headers, json=payload)


class TestAppointmentsAPI:
    """CRUD and lifecycle operations on appointments."""

    def test_create_appointment(self, app_url, api_headers, test_tenant, appointment_deps):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = _create_appointment(app_url, headers, appointment_deps, days_offset=2, hour=10)
        assert resp.status_code == 201
        body = resp.json()
        assert body.get("success") is True

    def test_get_appointment(self, app_url, api_headers, test_tenant, appointment_deps):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Create
        create_resp = _create_appointment(app_url, headers, appointment_deps, days_offset=3, hour=11)
        assert create_resp.status_code == 201
        appt_id = create_resp.json()["data"]["id"]

        # Get
        resp = requests.get(f"{app_url}/api/appointments/{appt_id}", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_confirm_appointment(self, app_url, api_headers, test_tenant, appointment_deps):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        create_resp = _create_appointment(app_url, headers, appointment_deps, days_offset=4, hour=9)
        assert create_resp.status_code == 201
        appt_id = create_resp.json()["data"]["id"]

        resp = requests.post(f"{app_url}/api/appointments/{appt_id}/confirm", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_cancel_appointment(self, app_url, api_headers, test_tenant, appointment_deps):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        create_resp = _create_appointment(app_url, headers, appointment_deps, days_offset=5, hour=14)
        assert create_resp.status_code == 201
        appt_id = create_resp.json()["data"]["id"]

        resp = requests.post(f"{app_url}/api/appointments/{appt_id}/cancel", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_complete_appointment(self, app_url, api_headers, test_tenant, appointment_deps):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        create_resp = _create_appointment(app_url, headers, appointment_deps, days_offset=6, hour=15)
        assert create_resp.status_code == 201
        appt_id = create_resp.json()["data"]["id"]

        # Confirm first
        requests.post(f"{app_url}/api/appointments/{appt_id}/confirm", headers=headers)

        resp = requests.post(f"{app_url}/api/appointments/{appt_id}/complete", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_no_show(self, app_url, api_headers, test_tenant, appointment_deps):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        create_resp = _create_appointment(app_url, headers, appointment_deps, days_offset=7, hour=16)
        assert create_resp.status_code == 201
        appt_id = create_resp.json()["data"]["id"]

        resp = requests.post(f"{app_url}/api/appointments/{appt_id}/no-show", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_reschedule(self, app_url, api_headers, test_tenant, appointment_deps):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        create_resp = _create_appointment(app_url, headers, appointment_deps, days_offset=8, hour=10)
        assert create_resp.status_code == 201
        appt_id = create_resp.json()["data"]["id"]

        new_date = (date.today() + timedelta(days=9)).isoformat()
        resp = requests.post(
            f"{app_url}/api/appointments/{appt_id}/reschedule",
            headers=headers,
            json={
                "new_start_at": f"{new_date}T11:00:00",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_conflict_detection(self, app_url, api_headers, test_tenant, appointment_deps):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Create first appointment
        resp1 = _create_appointment(app_url, headers, appointment_deps, days_offset=10, hour=10)
        assert resp1.status_code == 201

        # Try same time slot - should conflict
        resp2 = _create_appointment(app_url, headers, appointment_deps, days_offset=10, hour=10)
        assert resp2.status_code == 409

    def test_by_client_phone(self, app_url, api_headers, test_tenant, appointment_deps):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        phone = appointment_deps["contact"]["phone"]
        resp = requests.get(
            f"{app_url}/api/appointments/by-client/{phone}", headers=headers
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
