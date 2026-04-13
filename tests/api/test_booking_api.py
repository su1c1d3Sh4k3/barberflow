"""
Tests for /api/booking/{slug} endpoints (public booking flow).
"""
import requests
import pytest
from datetime import date, timedelta


@pytest.fixture(scope="module")
def booking_data(app_url, api_headers, test_tenant):
    """Create data needed for booking tests. Uses the tenant's public_slug."""
    headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

    # Category
    cat_resp = requests.post(
        f"{app_url}/api/categories",
        headers=headers,
        json={"name": "Cat Booking", "description": "Teste booking"},
    )
    assert cat_resp.status_code == 201
    category = cat_resp.json()["data"]

    # Service
    svc_resp = requests.post(
        f"{app_url}/api/services",
        headers=headers,
        json={
            "name": "Corte Booking",
            "duration_min": 30,
            "price": 40.00,
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
            "name": "Barbeiro Booking",
            "phone": "11999995001",
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


class TestBookingAPI:
    """Public booking flow endpoints."""

    def test_booking_categories(self, app_url, booking_data):
        slug = booking_data["slug"]
        resp = requests.get(
            f"{app_url}/api/booking/{slug}",
            params={"step": "categories"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "categories" in body or body.get("success") is True

    def test_booking_services(self, app_url, booking_data):
        slug = booking_data["slug"]
        cat_id = booking_data["category"]["id"]
        resp = requests.get(
            f"{app_url}/api/booking/{slug}",
            params={"step": "services", "category_id": cat_id},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "services" in body or body.get("success") is True

    def test_booking_professionals(self, app_url, booking_data):
        slug = booking_data["slug"]
        resp = requests.get(
            f"{app_url}/api/booking/{slug}",
            params={"step": "professionals", "service_id": booking_data["service"]["id"]},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "professionals" in body or body.get("success") is True

    def test_booking_slots(self, app_url, booking_data):
        slug = booking_data["slug"]
        future_date = (date.today() + timedelta(days=1)).isoformat()
        resp = requests.get(
            f"{app_url}/api/booking/{slug}",
            params={
                "step": "slots",
                "professional_id": booking_data["professional"]["id"],
                "service_id": booking_data["service"]["id"],
                "date": future_date,
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "slots" in body or body.get("success") is True

    def test_booking_create(self, app_url, booking_data):
        slug = booking_data["slug"]
        future_date = (date.today() + timedelta(days=2)).isoformat()

        # First fetch available slots
        slots_resp = requests.get(
            f"{app_url}/api/booking/{slug}",
            params={
                "step": "slots",
                "professional_id": booking_data["professional"]["id"],
                "service_id": booking_data["service"]["id"],
                "date": future_date,
            },
        )
        slots = slots_resp.json().get("slots", [])

        if not slots:
            # No available slots (no business hours configured) — skip booking test
            pytest.skip("No available slots for booking test (no business hours)")

        slot = slots[0]
        payload = {
            "professional_id": booking_data["professional"]["id"],
            "services": [{"id": booking_data["service"]["id"], "price": booking_data["service"]["price"]}],
            "slot_start": slot["slot_start"],
            "slot_end": slot["slot_end"],
            "customer_name": "Cliente Booking",
            "customer_phone": "5511988885001",
        }
        resp = requests.post(
            f"{app_url}/api/booking/{slug}",
            params={"step": "book"},
            json=payload,
        )
        # May return 200 or 201 depending on implementation
        assert resp.status_code in (200, 201), (
            f"Expected 200/201 for booking create, got {resp.status_code}: {resp.text[:200]}"
        )
        body = resp.json()
        assert "error" not in body or body.get("success") is True

    def test_booking_invalid_slug(self, app_url):
        resp = requests.get(
            f"{app_url}/api/booking/nonexistent",
            params={"step": "categories"},
        )
        assert resp.status_code == 404
        body = resp.json()
        assert body.get("success") is False or "error" in body
