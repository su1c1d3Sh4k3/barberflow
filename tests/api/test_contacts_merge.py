"""
Tests for POST /api/contacts/merge endpoint.
"""
import requests
import pytest


class TestContactsMerge:
    """Merge duplicate contacts."""

    def _create_contact(self, app_url, headers, name, phone):
        resp = requests.post(
            f"{app_url}/api/contacts",
            headers=headers,
            json={"name": name, "phone": phone},
        )
        assert resp.status_code == 201, f"Failed to create contact: {resp.text}"
        return resp.json()["data"]

    def test_merge_success(self, app_url, api_headers, test_tenant):
        """Merging two contacts should keep primary and delete secondary."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        primary = self._create_contact(app_url, headers, "Carlos Principal", "5511900010001")
        secondary = self._create_contact(app_url, headers, "Carlos Duplicado", "5511900010002")

        resp = requests.post(
            f"{app_url}/api/contacts/merge",
            headers=headers,
            json={"primary_id": primary["id"], "secondary_id": secondary["id"]},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert body["data"]["id"] == primary["id"]

        # Secondary should no longer exist
        resp2 = requests.get(
            f"{app_url}/api/contacts/{secondary['id']}",
            headers=headers,
        )
        assert resp2.status_code in (404, 200)
        if resp2.status_code == 200:
            # If the endpoint returns 200, check it's an error
            b = resp2.json()
            assert b.get("success") is False or b.get("data") is None

    def test_merge_same_tenant_only(self, app_url, api_headers, test_tenant, supabase_headers, supabase_url):
        """Cannot merge contacts from a different tenant."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        contact = self._create_contact(app_url, headers, "Teste Tenant", "5511900010003")

        # Use a fake UUID for a contact that doesn't belong to this tenant
        fake_id = "00000000-0000-0000-0000-000000000000"

        resp = requests.post(
            f"{app_url}/api/contacts/merge",
            headers=headers,
            json={"primary_id": contact["id"], "secondary_id": fake_id},
        )
        assert resp.status_code == 404
        body = resp.json()
        assert body.get("success") is False

    def test_merge_transfers_appointments(self, app_url, api_headers, test_tenant, supabase_headers, supabase_url):
        """Appointments from secondary should be transferred to primary after merge."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        tenant_id = test_tenant["tenant_id"]

        primary = self._create_contact(app_url, headers, "Ana Principal", "5511900010004")
        secondary = self._create_contact(app_url, headers, "Ana Duplicada", "5511900010005")

        # Create a professional and service for appointment
        prof_resp = requests.post(
            f"{app_url}/api/professionals",
            headers=headers,
            json={"name": "Barbeiro Merge Test", "email": "merge@test.com", "phone": "5511900099001"},
        )
        assert prof_resp.status_code == 201, f"Failed to create professional: {prof_resp.text}"
        prof = prof_resp.json()["data"]

        svc_resp = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={"name": "Corte Merge Test", "duration_min": 30, "price": 50},
        )
        assert svc_resp.status_code == 201, f"Failed to create service: {svc_resp.text}"
        svc = svc_resp.json()["data"]

        # Create appointment for secondary contact
        appt_resp = requests.post(
            f"{app_url}/api/appointments",
            headers=headers,
            json={
                "contact_id": secondary["id"],
                "professional_id": prof["id"],
                "service_ids": [svc["id"]],
                "start_at": "2026-06-15T10:00:00Z",
            },
        )
        assert appt_resp.status_code == 201, f"Failed to create appointment: {appt_resp.text}"
        appt_id = appt_resp.json()["data"]["id"]

        # Merge
        resp = requests.post(
            f"{app_url}/api/contacts/merge",
            headers=headers,
            json={"primary_id": primary["id"], "secondary_id": secondary["id"]},
        )
        assert resp.status_code == 200

        # Verify appointment now belongs to primary
        appt_check = requests.get(
            f"{app_url}/api/appointments/{appt_id}",
            headers=headers,
        )
        assert appt_check.status_code == 200
        assert appt_check.json()["data"]["contact_id"] == primary["id"]

    def test_merge_requires_both_ids(self, app_url, api_headers, test_tenant):
        """Must provide both primary_id and secondary_id."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        resp = requests.post(
            f"{app_url}/api/contacts/merge",
            headers=headers,
            json={"primary_id": "some-id"},
        )
        assert resp.status_code == 400

    def test_merge_same_id_rejected(self, app_url, api_headers, test_tenant):
        """Cannot merge a contact with itself."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        contact = self._create_contact(app_url, headers, "Self Merge", "5511900010006")

        resp = requests.post(
            f"{app_url}/api/contacts/merge",
            headers=headers,
            json={"primary_id": contact["id"], "secondary_id": contact["id"]},
        )
        assert resp.status_code == 400
