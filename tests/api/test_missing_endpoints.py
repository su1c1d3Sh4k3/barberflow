"""
Tests for the 7 new/missing API endpoints.
"""
import requests
import pytest
from datetime import datetime, timedelta


class TestServicesByCategory:
    """GET /api/services/by-category/[categoryId]"""

    def test_services_by_category(self, app_url, api_headers, test_tenant, supabase_headers, supabase_url):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        tenant_id = test_tenant["tenant_id"]

        # Create a category
        cat_resp = requests.post(
            f"{supabase_url}/rest/v1/service_categories",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "name": "Cabelo Test"},
        )
        assert cat_resp.status_code in (200, 201), f"Failed to create category: {cat_resp.text}"
        cat = cat_resp.json()[0] if isinstance(cat_resp.json(), list) else cat_resp.json()

        # Create a service in that category
        svc_resp = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={"name": "Corte Cabelo Cat", "duration_min": 30, "price": 40, "category_id": cat["id"]},
        )
        assert svc_resp.status_code == 201

        # Query by category
        resp = requests.get(
            f"{app_url}/api/services/by-category/{cat['id']}",
            headers=headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert isinstance(body["data"], list)
        assert any(s["name"] == "Corte Cabelo Cat" for s in body["data"])

    def test_empty_category(self, app_url, api_headers, test_tenant, supabase_headers, supabase_url):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        tenant_id = test_tenant["tenant_id"]

        # Create an empty category
        cat_resp = requests.post(
            f"{supabase_url}/rest/v1/service_categories",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "name": "Vazio Test"},
        )
        assert cat_resp.status_code in (200, 201)
        cat = cat_resp.json()[0] if isinstance(cat_resp.json(), list) else cat_resp.json()

        resp = requests.get(
            f"{app_url}/api/services/by-category/{cat['id']}",
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"] == []


class TestServicesByProfessional:
    """GET /api/services/by-professional/[professionalId]"""

    def test_services_by_professional(self, app_url, api_headers, test_tenant, supabase_headers, supabase_url):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        # Create professional
        prof_resp = requests.post(
            f"{app_url}/api/professionals",
            headers=headers,
            json={"name": "Barbeiro SvcProf", "email": "svcprof@test.com", "phone": "5511900020001"},
        )
        assert prof_resp.status_code == 201
        prof = prof_resp.json()["data"]

        # Create service
        svc_resp = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={"name": "Corte SvcProf", "duration_min": 30, "price": 50},
        )
        assert svc_resp.status_code == 201
        svc = svc_resp.json()["data"]

        # Link them
        requests.post(
            f"{supabase_url}/rest/v1/professional_services",
            headers=supabase_headers,
            json={"professional_id": prof["id"], "service_id": svc["id"]},
        )

        resp = requests.get(
            f"{app_url}/api/services/by-professional/{prof['id']}",
            headers=headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert any(s["id"] == svc["id"] for s in body["data"])

    def test_no_services_for_professional(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        # Create professional with no services
        prof_resp = requests.post(
            f"{app_url}/api/professionals",
            headers=headers,
            json={"name": "Barbeiro Sem Servico", "email": "nosvc@test.com", "phone": "5511900020002"},
        )
        assert prof_resp.status_code == 201
        prof = prof_resp.json()["data"]

        resp = requests.get(
            f"{app_url}/api/services/by-professional/{prof['id']}",
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"] == []


class TestProfessionalsByService:
    """GET /api/professionals/by-service/[serviceId]"""

    def test_professionals_by_service(self, app_url, api_headers, test_tenant, supabase_headers, supabase_url):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        # Create professional
        prof_resp = requests.post(
            f"{app_url}/api/professionals",
            headers=headers,
            json={"name": "Barbeiro ProfSvc", "email": "profsvc@test.com", "phone": "5511900030001"},
        )
        assert prof_resp.status_code == 201
        prof = prof_resp.json()["data"]

        # Create service
        svc_resp = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={"name": "Corte ProfSvc", "duration_min": 30, "price": 50},
        )
        assert svc_resp.status_code == 201
        svc = svc_resp.json()["data"]

        # Link them
        requests.post(
            f"{supabase_url}/rest/v1/professional_services",
            headers=supabase_headers,
            json={"professional_id": prof["id"], "service_id": svc["id"]},
        )

        resp = requests.get(
            f"{app_url}/api/professionals/by-service/{svc['id']}",
            headers=headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert any(p["id"] == prof["id"] for p in body["data"])

    def test_no_professionals_for_service(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        # Create service with no professionals linked
        svc_resp = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={"name": "Servico Sem Prof", "duration_min": 20, "price": 30},
        )
        assert svc_resp.status_code == 201
        svc = svc_resp.json()["data"]

        resp = requests.get(
            f"{app_url}/api/professionals/by-service/{svc['id']}",
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"] == []


class TestAvailabilityToday:
    """GET /api/availability/today"""

    def test_today_requires_service_id(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/availability/today", headers=headers)
        assert resp.status_code == 400
        assert "service_id" in resp.json().get("error", "")

    def test_today_with_service_id(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        # Create a service
        svc_resp = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={"name": "Corte Today", "duration_min": 30, "price": 50},
        )
        assert svc_resp.status_code == 201
        svc = svc_resp.json()["data"]

        resp = requests.get(
            f"{app_url}/api/availability/today",
            headers=headers,
            params={"service_id": svc["id"]},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True


class TestAppointmentPatch:
    """PATCH /api/appointments/[id] — update appointment fields with validation and history."""

    def test_patch_appointment_status(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        # Create professional + service + appointment
        prof_resp = requests.post(
            f"{app_url}/api/professionals",
            headers=headers,
            json={"name": "Barbeiro Patch", "email": "patch@test.com", "phone": "5511900040001"},
        )
        assert prof_resp.status_code == 201
        prof = prof_resp.json()["data"]

        svc_resp = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={"name": "Corte Patch", "duration_min": 30, "price": 50},
        )
        assert svc_resp.status_code == 201
        svc = svc_resp.json()["data"]

        appt_resp = requests.post(
            f"{app_url}/api/appointments",
            headers=headers,
            json={
                "client_name": "Cliente Patch",
                "client_phone": "5511900040002",
                "professional_id": prof["id"],
                "service_ids": [svc["id"]],
                "start_at": "2026-07-01T10:00:00Z",
            },
        )
        assert appt_resp.status_code == 201
        appt = appt_resp.json()["data"]

        # Patch the appointment
        patch_resp = requests.patch(
            f"{app_url}/api/appointments/{appt['id']}",
            headers=headers,
            json={"notes": "Cliente VIP", "status": "confirmado"},
        )
        assert patch_resp.status_code == 200
        body = patch_resp.json()
        assert body.get("success") is True
        assert body["data"]["notes"] == "Cliente VIP"
        assert body["data"]["status"] == "confirmado"

    def test_patch_rejects_empty_update(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        # Create a minimal appointment
        prof_resp = requests.post(
            f"{app_url}/api/professionals",
            headers=headers,
            json={"name": "Barbeiro EmptyPatch", "email": "emptypatch@test.com", "phone": "5511900040003"},
        )
        assert prof_resp.status_code == 201
        prof = prof_resp.json()["data"]

        svc_resp = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={"name": "Corte EmptyPatch", "duration_min": 30, "price": 50},
        )
        assert svc_resp.status_code == 201
        svc = svc_resp.json()["data"]

        appt_resp = requests.post(
            f"{app_url}/api/appointments",
            headers=headers,
            json={
                "client_name": "Cliente EmptyPatch",
                "client_phone": "5511900040004",
                "professional_id": prof["id"],
                "service_ids": [svc["id"]],
                "start_at": "2026-07-02T10:00:00Z",
            },
        )
        assert appt_resp.status_code == 201
        appt = appt_resp.json()["data"]

        # Patch with no valid fields
        patch_resp = requests.patch(
            f"{app_url}/api/appointments/{appt['id']}",
            headers=headers,
            json={"invalid_field": "value"},
        )
        assert patch_resp.status_code == 400


class TestAppointmentsUpcoming:
    """GET /api/appointments/upcoming"""

    def test_upcoming_returns_list(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        resp = requests.get(f"{app_url}/api/appointments/upcoming", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert isinstance(body["data"], list)

    def test_upcoming_filters_future_only(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        # Create professional + service
        prof_resp = requests.post(
            f"{app_url}/api/professionals",
            headers=headers,
            json={"name": "Barbeiro Upcoming", "email": "upcoming@test.com", "phone": "5511900050001"},
        )
        assert prof_resp.status_code == 201
        prof = prof_resp.json()["data"]

        svc_resp = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={"name": "Corte Upcoming", "duration_min": 30, "price": 50},
        )
        assert svc_resp.status_code == 201
        svc = svc_resp.json()["data"]

        # Create a future appointment
        future_time = (datetime.utcnow() + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
        appt_resp = requests.post(
            f"{app_url}/api/appointments",
            headers=headers,
            json={
                "client_name": "Cliente Upcoming",
                "client_phone": "5511900050002",
                "professional_id": prof["id"],
                "service_ids": [svc["id"]],
                "start_at": future_time,
            },
        )
        assert appt_resp.status_code == 201

        resp = requests.get(f"{app_url}/api/appointments/upcoming", headers=headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        # All returned appointments should be in the future
        for appt in data:
            assert appt["start_at"] > datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


class TestAppointmentReschedule:
    """POST /api/appointments/[id]/reschedule"""

    def test_reschedule_appointment(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        # Create professional + service + appointment
        prof_resp = requests.post(
            f"{app_url}/api/professionals",
            headers=headers,
            json={"name": "Barbeiro Reschedule", "email": "resched@test.com", "phone": "5511900060001"},
        )
        assert prof_resp.status_code == 201
        prof = prof_resp.json()["data"]

        svc_resp = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={"name": "Corte Reschedule", "duration_min": 30, "price": 50},
        )
        assert svc_resp.status_code == 201
        svc = svc_resp.json()["data"]

        appt_resp = requests.post(
            f"{app_url}/api/appointments",
            headers=headers,
            json={
                "client_name": "Cliente Reschedule",
                "client_phone": "5511900060002",
                "professional_id": prof["id"],
                "service_ids": [svc["id"]],
                "start_at": "2026-08-01T10:00:00Z",
            },
        )
        assert appt_resp.status_code == 201
        appt = appt_resp.json()["data"]

        # Reschedule
        resp = requests.post(
            f"{app_url}/api/appointments/{appt['id']}/reschedule",
            headers=headers,
            json={"new_start_at": "2026-08-02T14:00:00Z"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert "2026-08-02" in body["data"]["start_at"]

    def test_reschedule_requires_new_start_at(self, app_url, api_headers, test_tenant):
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        # Create professional + service + appointment
        prof_resp = requests.post(
            f"{app_url}/api/professionals",
            headers=headers,
            json={"name": "Barbeiro NoStart", "email": "nostart@test.com", "phone": "5511900060003"},
        )
        assert prof_resp.status_code == 201
        prof = prof_resp.json()["data"]

        svc_resp = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={"name": "Corte NoStart", "duration_min": 30, "price": 50},
        )
        assert svc_resp.status_code == 201
        svc = svc_resp.json()["data"]

        appt_resp = requests.post(
            f"{app_url}/api/appointments",
            headers=headers,
            json={
                "client_name": "Cliente NoStart",
                "client_phone": "5511900060004",
                "professional_id": prof["id"],
                "service_ids": [svc["id"]],
                "start_at": "2026-08-03T10:00:00Z",
            },
        )
        assert appt_resp.status_code == 201
        appt = appt_resp.json()["data"]

        resp = requests.post(
            f"{app_url}/api/appointments/{appt['id']}/reschedule",
            headers=headers,
            json={},
        )
        assert resp.status_code == 400
