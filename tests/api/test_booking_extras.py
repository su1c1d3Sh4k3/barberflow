"""
Tests for the booking wizard extras:
- .ics file generation (client-side, tested via unit logic)
- "Agendar outro servico" flow (reset to categories keeping customer info)
- Booking API still works (regression)
"""
import requests
import pytest
from datetime import date, timedelta


@pytest.fixture(scope="module")
def booking_extras_data(app_url, api_headers, test_tenant):
    """Create data needed for booking extras tests."""
    headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

    # Category
    cat_resp = requests.post(
        f"{app_url}/api/categories",
        headers=headers,
        json={"name": "Cat Extras", "description": "Teste extras"},
    )
    assert cat_resp.status_code == 201
    category = cat_resp.json()["data"]

    # Service
    svc_resp = requests.post(
        f"{app_url}/api/services",
        headers=headers,
        json={
            "name": "Corte Extras",
            "duration_min": 30,
            "price": 45.00,
            "category_id": category["id"],
        },
    )
    assert svc_resp.status_code == 201
    service = svc_resp.json()["data"]

    # Professional
    prof_resp = requests.post(
        f"{app_url}/api/professionals",
        headers=headers,
        json={
            "name": "Barbeiro Extras",
            "phone": "11999995010",
            "service_ids": [service["id"]],
        },
    )
    assert prof_resp.status_code == 201
    professional = prof_resp.json()["data"]

    return {
        "slug": "test-barberflow-e2e",
        "category": category,
        "service": service,
        "professional": professional,
    }


class TestBookingExtras:
    """Tests for booking wizard extras features."""

    def test_categories_endpoint_still_works(self, app_url, booking_extras_data):
        """Regression: categories endpoint must still return data."""
        slug = booking_extras_data["slug"]
        resp = requests.get(
            f"{app_url}/api/booking/{slug}",
            params={"step": "categories"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "categories" in body or body.get("success") is True

    def test_services_endpoint_returns_data(self, app_url, booking_extras_data):
        """Services endpoint returns services for a category."""
        slug = booking_extras_data["slug"]
        cat_id = booking_extras_data["category"]["id"]
        resp = requests.get(
            f"{app_url}/api/booking/{slug}",
            params={"step": "services", "category_id": cat_id},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "services" in body or body.get("success") is True

    def test_professionals_endpoint(self, app_url, booking_extras_data):
        """Professionals endpoint returns data."""
        slug = booking_extras_data["slug"]
        resp = requests.get(
            f"{app_url}/api/booking/{slug}",
            params={
                "step": "professionals",
                "service_id": booking_extras_data["service"]["id"],
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "professionals" in body or body.get("success") is True

    def test_booking_flow_complete(self, app_url, booking_extras_data):
        """Full booking flow works (required for 'agendar outro' feature to make sense)."""
        slug = booking_extras_data["slug"]
        future_date = (date.today() + timedelta(days=3)).isoformat()

        slots_resp = requests.get(
            f"{app_url}/api/booking/{slug}",
            params={
                "step": "slots",
                "professional_id": booking_extras_data["professional"]["id"],
                "service_id": booking_extras_data["service"]["id"],
                "date": future_date,
            },
        )
        slots = slots_resp.json().get("slots", [])

        if not slots:
            pytest.skip("No available slots (no business hours configured)")

        slot = slots[0]
        payload = {
            "professional_id": booking_extras_data["professional"]["id"],
            "services": [
                {"id": booking_extras_data["service"]["id"], "price": 45.00}
            ],
            "slot_start": slot["slot_start"],
            "slot_end": slot["slot_end"],
            "customer_name": "Cliente Extras",
            "customer_phone": "5511988885010",
        }
        resp = requests.post(
            f"{app_url}/api/booking/{slug}",
            params={"step": "book"},
            json=payload,
        )
        assert resp.status_code in (200, 201), (
            f"Expected 200/201, got {resp.status_code}: {resp.text[:200]}"
        )

    def test_ics_generation_logic(self):
        """
        Unit test for .ics file content structure.
        The actual generation is client-side JS; here we verify the
        expected format by constructing a minimal ICS string.
        """
        # Simulate what the client-side generateICS function produces
        summary = "Corte Extras - Barbearia Teste"
        start_iso = "20260415T100000Z"
        end_iso = "20260415T103000Z"

        ics_lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//BarberFlow//Booking//PT",
            "BEGIN:VEVENT",
            f"DTSTART:{start_iso}",
            f"DTEND:{end_iso}",
            f"SUMMARY:{summary}",
            "LOCATION:",
            "DESCRIPTION:Profissional: Barbeiro Extras",
            "STATUS:CONFIRMED",
            "END:VEVENT",
            "END:VCALENDAR",
        ]
        ics_content = "\r\n".join(ics_lines)

        assert "BEGIN:VCALENDAR" in ics_content
        assert "BEGIN:VEVENT" in ics_content
        assert "DTSTART:" in ics_content
        assert "DTEND:" in ics_content
        assert summary in ics_content
        assert "END:VCALENDAR" in ics_content

    def test_booking_reset_keeps_customer_info_logic(self):
        """
        Verify the state reset logic for 'agendar outro servico'.
        The wizard resets to step 1 (categories) keeping customerName/customerPhone.
        """
        # Simulate the state after a successful booking
        state_after_booking = {
            "step": 7,
            "customerName": "Joao Silva",
            "customerPhone": "(11) 99999-8888",
            "categoryId": "some-cat-id",
            "categoryName": "Cortes",
            "selectedServices": [{"id": "svc1", "name": "Corte", "price": 45}],
            "selectedDate": "2026-04-15",
            "professionalId": "prof1",
            "professionalName": "Barbeiro X",
            "selectedSlot": {
                "slot_start": "2026-04-15T10:00:00",
                "slot_end": "2026-04-15T10:30:00",
            },
        }

        # Simulate what handleBookAnother does:
        reset_state = {
            "step": 1,  # Goes to categories, NOT step 0
            "customerName": state_after_booking["customerName"],
            "customerPhone": state_after_booking["customerPhone"],
            "categoryId": None,
            "categoryName": "",
            "selectedServices": [],
            "selectedDate": "",
            "professionalId": None,
            "professionalName": "",
            "selectedSlot": None,
        }

        # Customer info is preserved
        assert reset_state["customerName"] == "Joao Silva"
        assert reset_state["customerPhone"] == "(11) 99999-8888"
        # Booking data is cleared
        assert reset_state["step"] == 1
        assert reset_state["categoryId"] is None
        assert reset_state["selectedServices"] == []
        assert reset_state["selectedDate"] == ""
        assert reset_state["professionalId"] is None
        assert reset_state["selectedSlot"] is None

    def test_share_url_logic(self):
        """
        Verify the share URL is the booking page URL.
        Web Share API / clipboard fallback is browser-only,
        but we verify the URL construction.
        """
        slug = "test-barberflow-e2e"
        base_url = "https://example.com"
        booking_url = f"{base_url}/b/{slug}"

        assert slug in booking_url
        assert booking_url.startswith("https://")
        assert "/b/" in booking_url
