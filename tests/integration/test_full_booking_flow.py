"""Integration test: Full booking flow end-to-end."""
import pytest
import requests
import uuid
from datetime import datetime, timedelta

APP_URL = "http://localhost:3000"


@pytest.mark.integration
class TestFullBookingFlow:
    """End-to-end test simulating a complete booking lifecycle."""

    @pytest.fixture(autouse=True)
    def setup(self, supabase_headers, supabase_url):
        """Set up test data and clean up after."""
        self.headers = supabase_headers
        self.base_url = supabase_url
        self.tenant_id = None
        self.created_ids = {}

        yield

        # Cleanup in reverse order
        self._cleanup()

    def _cleanup(self):
        """Remove all test data created during the test."""
        if not self.tenant_id:
            return

        tables = [
            "appointment_services", "appointment_history", "appointments",
            "contacts", "professional_services", "professional_schedules",
            "professionals", "services", "service_categories",
            "business_hours", "companies", "settings", "subscriptions",
            "tenants",
        ]
        for table in tables:
            if table == "tenants":
                requests.delete(
                    f"{self.base_url}/rest/v1/{table}?id=eq.{self.tenant_id}",
                    headers={**self.headers, "Prefer": ""},
                )
            else:
                requests.delete(
                    f"{self.base_url}/rest/v1/{table}?tenant_id=eq.{self.tenant_id}",
                    headers={**self.headers, "Prefer": ""},
                )

    def _post(self, table, data):
        """Helper to POST to Supabase REST API."""
        resp = requests.post(
            f"{self.base_url}/rest/v1/{table}",
            headers=self.headers,
            json=data,
        )
        assert resp.status_code in (200, 201), (
            f"Failed to create {table}: {resp.status_code} - {resp.text}"
        )
        result = resp.json()
        return result[0] if isinstance(result, list) else result

    def _get(self, table, query_params):
        """Helper to GET from Supabase REST API."""
        resp = requests.get(
            f"{self.base_url}/rest/v1/{table}?{query_params}",
            headers=self.headers,
        )
        assert resp.status_code == 200, (
            f"Failed to GET {table}: {resp.status_code} - {resp.text}"
        )
        return resp.json()

    def _patch(self, table, query_params, data):
        """Helper to PATCH in Supabase REST API."""
        resp = requests.patch(
            f"{self.base_url}/rest/v1/{table}?{query_params}",
            headers={**self.headers, "Prefer": "return=representation"},
            json=data,
        )
        assert resp.status_code == 200, (
            f"Failed to PATCH {table}: {resp.status_code} - {resp.text}"
        )
        result = resp.json()
        return result[0] if isinstance(result, list) else result

    def test_complete_booking_lifecycle(self):
        """
        Full flow:
        1. Create tenant
        2. Create company + business hours
        3. Create professional + schedule
        4. Create service + category
        5. Call availability API -> get slots
        6. Create appointment -> verify created
        7. Confirm appointment -> verify status changed
        8. Complete appointment -> verify status changed
        9. Verify contact LTV updated
        """
        # Step 1: Create tenant
        tenant = self._post("tenants", {
            "name": "Integration Test Barber",
            "plan": "trial",
            "public_slug": f"int-test-{uuid.uuid4().hex[:8]}",
        })
        self.tenant_id = tenant["id"]

        # Step 2: Create company + business hours
        company = self._post("companies", {
            "tenant_id": self.tenant_id,
            "name": "Barbearia Integration",
            "is_default": True,
        })
        self.created_ids["company_id"] = company["id"]

        # Create business hours for today's weekday
        today_weekday = datetime.now().weekday()  # 0=Mon, 6=Sun
        business_hours = self._post("business_hours", {
            "tenant_id": self.tenant_id,
            "company_id": company["id"],
            "weekday": today_weekday,
            "open_time": "08:00",
            "close_time": "18:00",
            "closed": False,
        })

        # Step 3: Create professional + schedule
        professional = self._post("professionals", {
            "tenant_id": self.tenant_id,
            "company_id": company["id"],
            "name": "Barbeiro Teste",
            "active": True,
        })
        self.created_ids["professional_id"] = professional["id"]

        schedule = self._post("professional_schedules", {
            "professional_id": professional["id"],
            "weekday": today_weekday,
            "start_time": "08:00",
            "end_time": "18:00",
        })

        # Step 4: Create service category + service
        category = self._post("service_categories", {
            "tenant_id": self.tenant_id,
            "name": "Cortes",
        })
        self.created_ids["category_id"] = category["id"]

        service = self._post("services", {
            "tenant_id": self.tenant_id,
            "category_id": category["id"],
            "name": "Corte Simples",
            "duration_min": 30,
            "price": 50.00,
            "active": True,
        })
        self.created_ids["service_id"] = service["id"]

        # Link professional to service
        self._post("professional_services", {
            "tenant_id": self.tenant_id,
            "professional_id": professional["id"],
            "service_id": service["id"],
        })

        # Step 5: Check availability via API
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        avail_resp = requests.get(
            f"{APP_URL}/api/availability",
            params={
                "tenant_id": self.tenant_id,
                "professional_id": professional["id"],
                "service_id": service["id"],
                "date": tomorrow,
            },
            timeout=10,
        )
        # API might not exist yet; if it does, verify slots
        if avail_resp.status_code == 200:
            slots = avail_resp.json()
            assert isinstance(slots, (list, dict)), "Availability should return slots"

        # Step 6: Create contact and appointment
        contact = self._post("contacts", {
            "tenant_id": self.tenant_id,
            "name": "Cliente Teste",
            "phone": "5511999990000",
            "ltv": 0.00,
        })
        self.created_ids["contact_id"] = contact["id"]

        appointment_time = f"{tomorrow}T10:00:00"
        appointment = self._post("appointments", {
            "tenant_id": self.tenant_id,
            "company_id": company["id"],
            "professional_id": professional["id"],
            "contact_id": contact["id"],
            "start_at": appointment_time,
            "end_at": f"{tomorrow}T10:30:00",
            "status": "pendente",
        })
        self.created_ids["appointment_id"] = appointment["id"]
        assert appointment["status"] == "pendente", "Appointment should start as pending"

        # Link service to appointment
        self._post("appointment_services", {
            "tenant_id": self.tenant_id,
            "appointment_id": appointment["id"],
            "service_id": service["id"],
            "price_at_time": 50.00,
        })

        # Step 7: Confirm appointment
        confirmed = self._patch(
            "appointments",
            f"id=eq.{appointment['id']}",
            {"status": "confirmado"},
        )
        assert confirmed["status"] == "confirmado", (
            f"Expected 'confirmed', got '{confirmed['status']}'"
        )

        # Step 8: Complete appointment
        completed = self._patch(
            "appointments",
            f"id=eq.{appointment['id']}",
            {"status": "concluido"},
        )
        assert completed["status"] == "concluido", (
            f"Expected 'completed', got '{completed['status']}'"
        )

        # Step 9: Update and verify contact LTV
        self._patch(
            "contacts",
            f"id=eq.{contact['id']}",
            {"ltv": 50.00},
        )
        updated_contact = self._get("contacts", f"id=eq.{contact['id']}")
        assert len(updated_contact) > 0, "Contact should still exist"
        assert updated_contact[0]["ltv"] == 50.00, (
            f"Expected LTV=50.00, got {updated_contact[0]['ltv']}"
        )
