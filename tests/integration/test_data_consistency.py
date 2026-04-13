"""Integration tests for data consistency across tables."""
import pytest
import requests
import uuid
from datetime import datetime, timedelta


@pytest.mark.integration
class TestDataConsistency:
    """Tests verifying data integrity and consistency in the database."""

    def test_appointment_has_services(self, test_tenant, supabase_headers, supabase_url):
        """After creating appointment with services, verify junction table has entries."""
        tenant_id = test_tenant["tenant_id"]
        company_id = test_tenant["company_id"]

        # Create professional
        prof = requests.post(
            f"{supabase_url}/rest/v1/professionals",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "company_id": company_id, "name": "Prof Consistency", "active": True},
        ).json()
        prof = prof[0] if isinstance(prof, list) else prof

        # Create service category and service
        cat = requests.post(
            f"{supabase_url}/rest/v1/service_categories",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "name": "Cat Test"},
        ).json()
        cat = cat[0] if isinstance(cat, list) else cat

        svc = requests.post(
            f"{supabase_url}/rest/v1/services",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "category_id": cat["id"], "name": "Svc Test", "duration_min": 30, "price": 40.00, "active": True},
        ).json()
        svc = svc[0] if isinstance(svc, list) else svc

        # Create contact
        contact = requests.post(
            f"{supabase_url}/rest/v1/contacts",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "name": "Contact Consistency", "phone": "5511888880001"},
        ).json()
        contact = contact[0] if isinstance(contact, list) else contact

        # Create appointment
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        appt = requests.post(
            f"{supabase_url}/rest/v1/appointments",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "company_id": company_id,
                "professional_id": prof["id"],
                "contact_id": contact["id"],
                "start_at": f"{tomorrow}T14:00:00",
                "end_at": f"{tomorrow}T14:30:00",
                "status": "pendente",
            },
        ).json()
        appt = appt[0] if isinstance(appt, list) else appt

        # Link service to appointment
        link_resp = requests.post(
            f"{supabase_url}/rest/v1/appointment_services",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "appointment_id": appt["id"],
                "service_id": svc["id"],
                "price_at_time": 40.00,
            },
        )
        assert link_resp.status_code in (200, 201), (
            f"Failed to link service to appointment: {link_resp.text}"
        )

        # Verify junction table
        junction = requests.get(
            f"{supabase_url}/rest/v1/appointment_services?appointment_id=eq.{appt['id']}",
            headers=supabase_headers,
        ).json()
        assert len(junction) == 1, (
            f"Expected 1 appointment_service entry, got {len(junction)}"
        )
        assert junction[0]["service_id"] == svc["id"], "Service ID mismatch in junction table"

    def test_professional_services_link(self, test_tenant, supabase_headers, supabase_url):
        """After linking professional to services, verify both sides of the relationship."""
        tenant_id = test_tenant["tenant_id"]
        company_id = test_tenant["company_id"]

        # Create professional
        prof = requests.post(
            f"{supabase_url}/rest/v1/professionals",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "company_id": company_id, "name": "Prof Link Test", "active": True},
        ).json()
        prof = prof[0] if isinstance(prof, list) else prof

        # Create two services
        cat = requests.post(
            f"{supabase_url}/rest/v1/service_categories",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "name": "Cat Link Test"},
        ).json()
        cat = cat[0] if isinstance(cat, list) else cat

        svc1 = requests.post(
            f"{supabase_url}/rest/v1/services",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "category_id": cat["id"], "name": "Svc Link 1", "duration_min": 20, "price": 30.00, "active": True},
        ).json()
        svc1 = svc1[0] if isinstance(svc1, list) else svc1

        svc2 = requests.post(
            f"{supabase_url}/rest/v1/services",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "category_id": cat["id"], "name": "Svc Link 2", "duration_min": 40, "price": 60.00, "active": True},
        ).json()
        svc2 = svc2[0] if isinstance(svc2, list) else svc2

        # Link professional to both services
        for svc in [svc1, svc2]:
            resp = requests.post(
                f"{supabase_url}/rest/v1/professional_services",
                headers=supabase_headers,
                json={"tenant_id": tenant_id, "professional_id": prof["id"], "service_id": svc["id"]},
            )
            assert resp.status_code in (200, 201), (
                f"Failed to link professional to service: {resp.text}"
            )

        # Verify from professional side
        links = requests.get(
            f"{supabase_url}/rest/v1/professional_services?professional_id=eq.{prof['id']}",
            headers=supabase_headers,
        ).json()
        assert len(links) == 2, (
            f"Expected 2 professional_services entries, got {len(links)}"
        )

        # Verify from service side
        for svc in [svc1, svc2]:
            svc_links = requests.get(
                f"{supabase_url}/rest/v1/professional_services?service_id=eq.{svc['id']}",
                headers=supabase_headers,
            ).json()
            assert len(svc_links) >= 1, (
                f"Service {svc['id']} should have at least 1 professional linked"
            )

    def test_contact_phone_format(self, test_tenant, supabase_headers, supabase_url):
        """Verify phone number is stored correctly in the contacts table."""
        tenant_id = test_tenant["tenant_id"]
        test_phone = "5511987654321"

        contact = requests.post(
            f"{supabase_url}/rest/v1/contacts",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "name": "Phone Format Test", "phone": test_phone},
        ).json()
        contact = contact[0] if isinstance(contact, list) else contact

        # Re-fetch from DB
        fetched = requests.get(
            f"{supabase_url}/rest/v1/contacts?id=eq.{contact['id']}",
            headers=supabase_headers,
        ).json()

        assert len(fetched) == 1, "Contact should exist in DB"
        stored_phone = fetched[0]["phone"]
        assert stored_phone == test_phone, (
            f"Expected phone '{test_phone}', got '{stored_phone}'"
        )
        # Verify it's numeric only
        assert stored_phone.isdigit(), (
            f"Phone should be digits only, got '{stored_phone}'"
        )

    def test_appointment_history_logged(self, test_tenant, supabase_headers, supabase_url):
        """After status change, verify appointment_history entry exists."""
        tenant_id = test_tenant["tenant_id"]
        company_id = test_tenant["company_id"]

        # Create minimal appointment setup
        prof = requests.post(
            f"{supabase_url}/rest/v1/professionals",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "company_id": company_id, "name": "Prof History", "active": True},
        ).json()
        prof = prof[0] if isinstance(prof, list) else prof

        import uuid
        unique_phone = f"55119{uuid.uuid4().hex[:8]}"
        contact_resp = requests.post(
            f"{supabase_url}/rest/v1/contacts",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "name": "History Contact", "phone": unique_phone},
        )
        assert contact_resp.status_code in (200, 201), f"Contact creation failed: {contact_resp.text}"
        contact = contact_resp.json()[0] if isinstance(contact_resp.json(), list) else contact_resp.json()

        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        appt = requests.post(
            f"{supabase_url}/rest/v1/appointments",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "company_id": company_id,
                "professional_id": prof["id"],
                "contact_id": contact["id"],
                "start_at": f"{tomorrow}T16:00:00",
                "end_at": f"{tomorrow}T16:30:00",
                "status": "pendente",
            },
        ).json()
        appt = appt[0] if isinstance(appt, list) else appt

        # Log a history entry for status change
        history_resp = requests.post(
            f"{supabase_url}/rest/v1/appointment_history",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "appointment_id": appt["id"],
                "action": "confirmed",
                "performed_by": "system",
            },
        )
        assert history_resp.status_code in (200, 201), (
            f"Failed to create appointment history: {history_resp.text}"
        )

        # Verify history entry exists
        history = requests.get(
            f"{supabase_url}/rest/v1/appointment_history?appointment_id=eq.{appt['id']}",
            headers=supabase_headers,
        ).json()
        assert len(history) >= 1, "Appointment history should have at least 1 entry"
        assert history[0]["action"] == "confirmed", "Action should be 'confirmed'"
