"""
Tests for the 3 previously missing API endpoints: feedback, birthday-message, coupons by contact.
"""
import requests
import pytest
import uuid
from datetime import datetime, timedelta, timezone


class TestFeedbackEndpoint:
    """POST /api/feedback"""

    def test_feedback_endpoint(self, app_url, api_headers, supabase_url, supabase_headers, test_tenant):
        """Post feedback referencing an appointment, expect 200/201."""
        tenant_id = test_tenant["tenant_id"]
        company_id = test_tenant["company_id"]
        headers = {**api_headers, "x-tenant-id": tenant_id}

        # Create a professional
        prof_resp = requests.post(
            f"{supabase_url}/rest/v1/professionals",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "company_id": company_id, "name": "Feedback Prof"},
        )
        assert prof_resp.status_code in (200, 201), f"Failed to create professional: {prof_resp.text}"
        prof = prof_resp.json()[0] if isinstance(prof_resp.json(), list) else prof_resp.json()

        # Create a contact
        contact_resp = requests.post(
            f"{supabase_url}/rest/v1/contacts",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "name": "Feedback Client", "phone": "5511900000001"},
        )
        assert contact_resp.status_code in (200, 201), f"Failed to create contact: {contact_resp.text}"
        contact = contact_resp.json()[0] if isinstance(contact_resp.json(), list) else contact_resp.json()

        # Create an appointment via Supabase REST
        appt_resp = requests.post(
            f"{supabase_url}/rest/v1/appointments",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "company_id": company_id,
                "professional_id": prof["id"],
                "contact_id": contact["id"],
                "start_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT10:00:00Z"),
                "end_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT10:30:00Z"),
                "status": "concluido",
            },
        )
        assert appt_resp.status_code in (200, 201), f"Failed to create appointment: {appt_resp.text}"
        appt = appt_resp.json()[0] if isinstance(appt_resp.json(), list) else appt_resp.json()

        # Post feedback
        resp = requests.post(
            f"{app_url}/api/feedback",
            headers=headers,
            json={
                "appointment_id": appt["id"],
                "rating": 5,
                "comment": "Excelente atendimento!",
            },
        )
        assert resp.status_code in (200, 201), (
            f"Expected 200/201 for feedback, got {resp.status_code}: {resp.text}"
        )

        # Cleanup
        requests.delete(
            f"{supabase_url}/rest/v1/audit_logs?tenant_id=eq.{tenant_id}&entity_id=eq.{appt['id']}",
            headers={**supabase_headers, "Prefer": ""},
        )
        requests.delete(
            f"{supabase_url}/rest/v1/appointments?id=eq.{appt['id']}",
            headers={**supabase_headers, "Prefer": ""},
        )
        requests.delete(
            f"{supabase_url}/rest/v1/contacts?id=eq.{contact['id']}",
            headers={**supabase_headers, "Prefer": ""},
        )
        requests.delete(
            f"{supabase_url}/rest/v1/professionals?id=eq.{prof['id']}",
            headers={**supabase_headers, "Prefer": ""},
        )


class TestBirthdayMessageEndpoint:
    """POST /api/contacts/{id}/birthday-message"""

    def test_birthday_message_endpoint(self, app_url, api_headers, supabase_url, supabase_headers, test_tenant):
        """Post birthday message for a contact. May fail if no WhatsApp session, but should not 500."""
        tenant_id = test_tenant["tenant_id"]
        headers = {**api_headers, "x-tenant-id": tenant_id}

        # Create a contact
        contact_resp = requests.post(
            f"{supabase_url}/rest/v1/contacts",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "name": "Birthday Client",
                "phone": "5511900000002",
                "birthday": "1990-04-11",
            },
        )
        assert contact_resp.status_code in (200, 201), f"Failed to create contact: {contact_resp.text}"
        contact = contact_resp.json()[0] if isinstance(contact_resp.json(), list) else contact_resp.json()

        resp = requests.post(
            f"{app_url}/api/contacts/{contact['id']}/birthday-message",
            headers=headers,
            json={},
        )
        # 200 if everything works, 400 if no WhatsApp session or no birthday message configured
        # Key assertion: should NOT be a 500 server error
        assert resp.status_code < 500, (
            f"Expected non-500 for birthday-message, got {resp.status_code}: {resp.text}"
        )

        # Cleanup
        requests.delete(
            f"{supabase_url}/rest/v1/messages?contact_id=eq.{contact['id']}",
            headers={**supabase_headers, "Prefer": ""},
        )
        requests.delete(
            f"{supabase_url}/rest/v1/contacts?id=eq.{contact['id']}",
            headers={**supabase_headers, "Prefer": ""},
        )


class TestCouponsByContactEndpoint:
    """GET /api/coupons/by-contact/{phone}"""

    def test_coupons_by_contact_phone(self, app_url, api_headers, supabase_url, supabase_headers, test_tenant):
        """Create contact + coupon + coupon_instance, then fetch by phone."""
        tenant_id = test_tenant["tenant_id"]
        headers = {**api_headers, "x-tenant-id": tenant_id}
        phone = "5511900000003"

        # Create contact
        contact_resp = requests.post(
            f"{supabase_url}/rest/v1/contacts",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "name": "Coupon Client", "phone": phone},
        )
        assert contact_resp.status_code in (200, 201), f"Failed to create contact: {contact_resp.text}"
        contact = contact_resp.json()[0] if isinstance(contact_resp.json(), list) else contact_resp.json()

        # Create coupon
        coupon_resp = requests.post(
            f"{supabase_url}/rest/v1/coupons",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "code": f"TEST-{uuid.uuid4().hex[:6].upper()}",
                "discount_type": "percentage",
                "discount_value": 10,
                "active": True,
            },
        )
        assert coupon_resp.status_code in (200, 201), f"Failed to create coupon: {coupon_resp.text}"
        coupon = coupon_resp.json()[0] if isinstance(coupon_resp.json(), list) else coupon_resp.json()

        # Create coupon_instance linked to contact
        expires = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        ci_resp = requests.post(
            f"{supabase_url}/rest/v1/coupon_instances",
            headers=supabase_headers,
            json={
                "coupon_id": coupon["id"],
                "contact_id": contact["id"],
                "code": f"INST-{uuid.uuid4().hex[:6].upper()}",
                "used": False,
                "expires_at": expires,
            },
        )
        assert ci_resp.status_code in (200, 201), f"Failed to create coupon instance: {ci_resp.text}"
        ci = ci_resp.json()[0] if isinstance(ci_resp.json(), list) else ci_resp.json()

        # Fetch coupons by contact phone
        resp = requests.get(
            f"{app_url}/api/coupons/by-contact/{phone}",
            headers=headers,
        )
        assert resp.status_code == 200, (
            f"Expected 200 for coupons by contact, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        # The response may have a 'data' wrapper or be a direct list
        coupons_list = data.get("data", data) if isinstance(data, dict) else data
        assert isinstance(coupons_list, list), "Expected a list of coupons"
        assert len(coupons_list) >= 1, "Should find at least one coupon instance for the contact"

        # Cleanup
        requests.delete(
            f"{supabase_url}/rest/v1/coupon_instances?id=eq.{ci['id']}",
            headers={**supabase_headers, "Prefer": ""},
        )
        requests.delete(
            f"{supabase_url}/rest/v1/coupons?id=eq.{coupon['id']}",
            headers={**supabase_headers, "Prefer": ""},
        )
        requests.delete(
            f"{supabase_url}/rest/v1/contacts?id=eq.{contact['id']}",
            headers={**supabase_headers, "Prefer": ""},
        )
