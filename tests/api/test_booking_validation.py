"""
Tests for public booking API validation and error handling.
"""
import requests
import pytest
import uuid
from datetime import date, timedelta


@pytest.fixture(scope="module")
def booking_env(supabase_headers, supabase_url, test_tenant):
    """Set up public booking environment with slug."""
    tenant_id = test_tenant["tenant_id"]
    company_id = test_tenant["company_id"]

    # Get or set company public_slug
    slug = f"test-booking-{uuid.uuid4().hex[:6]}"
    requests.patch(
        f"{supabase_url}/rest/v1/companies?id=eq.{company_id}",
        headers=supabase_headers,
        json={"public_slug": slug},
    )

    # Ensure we have a category
    cat_resp = requests.post(
        f"{supabase_url}/rest/v1/service_categories",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "Booking Val Cat"},
    )
    cat = cat_resp.json()[0] if isinstance(cat_resp.json(), list) else cat_resp.json()

    # Create service
    svc_resp = requests.post(
        f"{supabase_url}/rest/v1/services",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "name": "Booking Val Service",
            "duration_min": 30,
            "price": 50.00,
            "category_id": cat["id"],
            "active": True,
        },
    )
    svc = svc_resp.json()[0] if isinstance(svc_resp.json(), list) else svc_resp.json()

    # Create professional
    prof_resp = requests.post(
        f"{supabase_url}/rest/v1/professionals",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "company_id": company_id,
            "name": "Booking Val Pro",
            "active": True,
        },
    )
    prof = prof_resp.json()[0] if isinstance(prof_resp.json(), list) else prof_resp.json()

    # Link professional to service
    requests.post(
        f"{supabase_url}/rest/v1/professional_services",
        headers=supabase_headers,
        json={"professional_id": prof["id"], "service_id": svc["id"]},
    )

    yield {
        "slug": slug,
        "tenant_id": tenant_id,
        "company_id": company_id,
        "category_id": cat["id"],
        "service_id": svc["id"],
        "professional_id": prof["id"],
    }

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/professional_services?professional_id=eq.{prof['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


class TestBookingValidation:
    """Validation tests for the public booking endpoint."""

    def test_booking_categories(self, app_url, booking_env):
        """GET booking categories should work."""
        slug = booking_env["slug"]
        resp = requests.get(f"{app_url}/api/booking/{slug}?step=categories")
        assert resp.status_code == 200
        body = resp.json()
        assert "categories" in body

    def test_booking_services(self, app_url, booking_env):
        """GET booking services for a category should work."""
        slug = booking_env["slug"]
        cat_id = booking_env["category_id"]
        resp = requests.get(f"{app_url}/api/booking/{slug}?step=services&category_id={cat_id}")
        assert resp.status_code == 200
        body = resp.json()
        assert "services" in body

    def test_booking_invalid_slug(self, app_url):
        """GET booking with invalid slug should return 404."""
        resp = requests.get(f"{app_url}/api/booking/nonexistent-slug-xyz?step=categories")
        assert resp.status_code == 404

    def _booking_payload(self, env, **overrides):
        """Build a valid booking payload, then apply overrides."""
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        payload = {
            "customer_name": "Test Client",
            "customer_phone": "5511999990001",
            "professional_id": env["professional_id"],
            "services": [{"id": env["service_id"]}],
            "slot_start": f"{tomorrow}T10:00:00",
            "slot_end": f"{tomorrow}T10:30:00",
        }
        payload.update(overrides)
        return payload

    def test_booking_missing_customer_name(self, app_url, booking_env):
        """POST booking without customer_name should return 400."""
        slug = booking_env["slug"]
        payload = self._booking_payload(booking_env)
        del payload["customer_name"]
        resp = requests.post(f"{app_url}/api/booking/{slug}?step=book", json=payload)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"

    def test_booking_missing_phone(self, app_url, booking_env):
        """POST booking without customer_phone should return 400."""
        slug = booking_env["slug"]
        payload = self._booking_payload(booking_env)
        del payload["customer_phone"]
        resp = requests.post(f"{app_url}/api/booking/{slug}?step=book", json=payload)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"

    def test_booking_short_name(self, app_url, booking_env):
        """POST booking with 1-char name should return 422."""
        slug = booking_env["slug"]
        payload = self._booking_payload(booking_env, customer_name="A")
        resp = requests.post(f"{app_url}/api/booking/{slug}?step=book", json=payload)
        assert resp.status_code == 422
        assert "details" in resp.json()

    def test_booking_invalid_professional_id(self, app_url, booking_env):
        """POST booking with invalid professional_id should return 422."""
        slug = booking_env["slug"]
        payload = self._booking_payload(booking_env, professional_id="not-a-uuid")
        resp = requests.post(f"{app_url}/api/booking/{slug}?step=book", json=payload)
        assert resp.status_code == 422

    def test_booking_empty_services(self, app_url, booking_env):
        """POST booking with empty services should return 400."""
        slug = booking_env["slug"]
        payload = self._booking_payload(booking_env, services=[])
        resp = requests.post(f"{app_url}/api/booking/{slug}?step=book", json=payload)
        assert resp.status_code == 400

    def test_booking_short_phone(self, app_url, booking_env):
        """POST booking with too-short phone should return 422."""
        slug = booking_env["slug"]
        payload = self._booking_payload(booking_env, customer_phone="123")
        resp = requests.post(f"{app_url}/api/booking/{slug}?step=book", json=payload)
        assert resp.status_code == 422
