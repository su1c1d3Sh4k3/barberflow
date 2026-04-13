"""
Integration test: Concurrent booking (race condition prevention).
Verifies that the advisory lock prevents double-booking.
"""
import requests
import pytest
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta


@pytest.mark.integration
class TestConcurrentBooking:
    """Verify that concurrent booking requests for the same slot don't double-book."""

    def test_concurrent_same_slot_only_one_wins(self, app_url, api_headers, test_tenant):
        """
        Send 5 simultaneous booking requests for the exact same slot.
        Exactly 1 should succeed (201), the rest should get 409 (conflict).
        """
        tenant_id = test_tenant["tenant_id"]
        headers = {**api_headers, "x-tenant-id": tenant_id}

        # Create dependencies: category, service, professional, contact
        cat = requests.post(
            f"{app_url}/api/categories",
            headers=headers,
            json={"name": "Concurrent Cat"},
        )
        assert cat.status_code == 201, f"Category create failed: {cat.text}"
        cat_id = cat.json()["data"]["id"]

        svc = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={"name": "Concurrent Svc", "duration_min": 30, "price": 50, "category_id": cat_id},
        )
        assert svc.status_code == 201, f"Service create failed: {svc.text}"
        svc_id = svc.json()["data"]["id"]

        prof = requests.post(
            f"{app_url}/api/professionals",
            headers=headers,
            json={"name": "Concurrent Prof", "phone": "11999997777"},
        )
        assert prof.status_code == 201, f"Professional create failed: {prof.text}"
        prof_id = prof.json()["data"]["id"]

        # Contact
        contact = requests.post(
            f"{app_url}/api/contacts",
            headers=headers,
            json={"name": "Concurrent Client", "phone": "5511988887777"},
        )
        assert contact.status_code == 201
        contact_id = contact.json()["data"]["id"]

        # Target slot
        future_date = (date.today() + timedelta(days=3)).isoformat()
        payload = {
            "contact_id": contact_id,
            "professional_id": prof_id,
            "service_id": svc_id,
            "start_at": f"{future_date}T14:00:00",
        }

        def book():
            return requests.post(
                f"{app_url}/api/appointments",
                headers=headers,
                json=payload,
                timeout=30,
            )

        # Send 5 concurrent requests
        results = []
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(book) for _ in range(5)]
            for f in as_completed(futures):
                results.append(f.result())

        status_codes = [r.status_code for r in results]
        success_count = status_codes.count(201)
        conflict_count = status_codes.count(409)

        assert success_count == 1, (
            f"Expected exactly 1 success (201), got {success_count}. All codes: {status_codes}"
        )
        assert conflict_count == 4, (
            f"Expected 4 conflicts (409), got {conflict_count}. All codes: {status_codes}"
        )

    def test_different_slots_both_succeed(self, app_url, api_headers, test_tenant):
        """Two bookings for different time slots should both succeed."""
        tenant_id = test_tenant["tenant_id"]
        headers = {**api_headers, "x-tenant-id": tenant_id}

        # Reuse existing data or create new
        cat = requests.post(
            f"{app_url}/api/categories",
            headers=headers,
            json={"name": "DiffSlot Cat"},
        ).json()["data"]

        svc = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={"name": "DiffSlot Svc", "duration_min": 30, "price": 40, "category_id": cat["id"]},
        ).json()["data"]

        prof = requests.post(
            f"{app_url}/api/professionals",
            headers=headers,
            json={"name": "DiffSlot Prof", "phone": "11999996666"},
        ).json()["data"]

        contact = requests.post(
            f"{app_url}/api/contacts",
            headers=headers,
            json={"name": "DiffSlot Client", "phone": "5511988886666"},
        ).json()["data"]

        future_date = (date.today() + timedelta(days=4)).isoformat()

        # Book 10:00 slot
        resp1 = requests.post(
            f"{app_url}/api/appointments",
            headers=headers,
            json={
                "contact_id": contact["id"],
                "professional_id": prof["id"],
                "service_id": svc["id"],
                "start_at": f"{future_date}T10:00:00",
            },
        )
        assert resp1.status_code == 201, f"First booking failed: {resp1.text}"

        # Book 11:00 slot (different time)
        resp2 = requests.post(
            f"{app_url}/api/appointments",
            headers=headers,
            json={
                "contact_id": contact["id"],
                "professional_id": prof["id"],
                "service_id": svc["id"],
                "start_at": f"{future_date}T11:00:00",
            },
        )
        assert resp2.status_code == 201, f"Second booking should succeed: {resp2.text}"
