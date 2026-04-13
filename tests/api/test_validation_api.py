"""
Tests for Zod validation on API routes.
Verifies that invalid payloads are rejected with 422.
"""
import requests
import pytest


class TestZodValidation:
    """Verify that API routes reject invalid payloads."""

    # ── Categories ──

    def test_category_missing_name(self, app_url, api_headers, test_tenant):
        """POST /api/categories without name should return 422."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/categories",
            headers=headers,
            json={"description": "No name provided"},
        )
        assert resp.status_code == 422, (
            f"Expected 422 for missing category name, got {resp.status_code}: {resp.text}"
        )
        body = resp.json()
        assert "error" in body or body.get("success") is False

    def test_category_name_too_short(self, app_url, api_headers, test_tenant):
        """POST /api/categories with 1-char name should return 422."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/categories",
            headers=headers,
            json={"name": "A"},
        )
        assert resp.status_code == 422

    # ── Services ──

    def test_service_missing_required_fields(self, app_url, api_headers, test_tenant):
        """POST /api/services without required fields should return 422."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={"name": "Incomplete Service"},
        )
        assert resp.status_code == 422, (
            f"Expected 422 for incomplete service, got {resp.status_code}: {resp.text}"
        )

    def test_service_negative_price(self, app_url, api_headers, test_tenant):
        """POST /api/services with negative price should return 422."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={
                "name": "Bad Price Service",
                "duration_min": 30,
                "price": -10,
                "category_id": "00000000-0000-0000-0000-000000000000",
            },
        )
        assert resp.status_code == 422

    def test_service_duration_too_short(self, app_url, api_headers, test_tenant):
        """POST /api/services with 1-minute duration should return 422."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={
                "name": "Too Short",
                "duration_min": 1,
                "price": 50,
                "category_id": "00000000-0000-0000-0000-000000000000",
            },
        )
        assert resp.status_code == 422

    # ── Contacts ──

    def test_contact_missing_name(self, app_url, api_headers, test_tenant):
        """POST /api/contacts without name should return 422."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/contacts",
            headers=headers,
            json={"phone": "5511999990001"},
        )
        assert resp.status_code == 422

    def test_contact_short_phone(self, app_url, api_headers, test_tenant):
        """POST /api/contacts with too-short phone should return 422."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/contacts",
            headers=headers,
            json={"name": "Bad Phone", "phone": "123"},
        )
        assert resp.status_code == 422

    # ── Professionals ──

    def test_professional_missing_name(self, app_url, api_headers, test_tenant):
        """POST /api/professionals without name should return 422."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/professionals",
            headers=headers,
            json={"phone": "11999999999"},
        )
        assert resp.status_code == 422

    def test_professional_commission_out_of_range(self, app_url, api_headers, test_tenant):
        """POST /api/professionals with commission > 100 should return 422."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/professionals",
            headers=headers,
            json={"name": "Bad Commission", "commission_pct": 150},
        )
        assert resp.status_code == 422

    # ── Appointments ──

    def test_appointment_missing_professional_id(self, app_url, api_headers, test_tenant):
        """POST /api/appointments without professional_id should return 422."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/appointments",
            headers=headers,
            json={
                "service_id": "00000000-0000-0000-0000-000000000001",
                "start_at": "2026-05-01T10:00:00",
            },
        )
        assert resp.status_code == 422, (
            f"Expected 422 for missing professional_id, got {resp.status_code}: {resp.text}"
        )
        body = resp.json()
        assert body.get("success") is False

    def test_appointment_missing_start_at(self, app_url, api_headers, test_tenant):
        """POST /api/appointments without start_at should return 422."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/appointments",
            headers=headers,
            json={
                "professional_id": "00000000-0000-0000-0000-000000000001",
                "service_id": "00000000-0000-0000-0000-000000000002",
            },
        )
        assert resp.status_code == 422, (
            f"Expected 422 for missing start_at, got {resp.status_code}: {resp.text}"
        )

    def test_appointment_invalid_professional_id_format(self, app_url, api_headers, test_tenant):
        """POST /api/appointments with non-UUID professional_id should return 422."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/appointments",
            headers=headers,
            json={
                "professional_id": "not-a-uuid",
                "service_id": "00000000-0000-0000-0000-000000000001",
                "start_at": "2026-05-01T10:00:00",
            },
        )
        assert resp.status_code == 422

    def test_appointment_empty_start_at(self, app_url, api_headers, test_tenant):
        """POST /api/appointments with empty start_at should return 422."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/appointments",
            headers=headers,
            json={
                "professional_id": "00000000-0000-0000-0000-000000000001",
                "service_id": "00000000-0000-0000-0000-000000000002",
                "start_at": "",
            },
        )
        assert resp.status_code == 422

    def test_appointment_empty_body(self, app_url, api_headers, test_tenant):
        """POST /api/appointments with empty body should return 422."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/appointments",
            headers=headers,
            json={},
        )
        assert resp.status_code == 422

    # ── Valid payloads still work ──

    def test_valid_category_passes_validation(self, app_url, api_headers, test_tenant):
        """POST /api/categories with valid data should return 201."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/categories",
            headers=headers,
            json={"name": "Valid Category", "description": "This is valid"},
        )
        assert resp.status_code == 201, (
            f"Valid category should pass, got {resp.status_code}: {resp.text}"
        )

    def test_valid_contact_passes_validation(self, app_url, api_headers, test_tenant):
        """POST /api/contacts with valid data should return 201."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/contacts",
            headers=headers,
            json={"name": "Valid Contact", "phone": "5511999990099"},
        )
        assert resp.status_code == 201, (
            f"Valid contact should pass, got {resp.status_code}: {resp.text}"
        )
