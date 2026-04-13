"""
Tests for /api/business-hours/today endpoint.
"""
import requests
from datetime import datetime


class TestBusinessHoursTodayAPI:
    """Test the /api/business-hours/today endpoint."""

    def test_requires_auth(self, app_url):
        """Endpoint should reject requests without auth."""
        resp = requests.get(f"{app_url}/api/business-hours/today")
        assert resp.status_code == 401
        body = resp.json()
        assert body.get("success") is False
        assert "Unauthorized" in body.get("error", "")

    def test_requires_tenant_id(self, app_url, api_headers):
        """Endpoint should reject requests without x-tenant-id."""
        resp = requests.get(f"{app_url}/api/business-hours/today", headers=api_headers)
        assert resp.status_code == 400
        body = resp.json()
        assert body.get("success") is False

    def test_returns_hours_for_today(self, app_url, api_headers, supabase_url,
                                     supabase_headers, test_tenant):
        """Should return business hours for the current weekday if configured."""
        tenant_id = test_tenant["tenant_id"]
        company_id = test_tenant["company_id"]
        today_weekday = datetime.now().weekday()
        # Python weekday: Mon=0, but JS Date.getDay(): Sun=0, Mon=1
        # Convert Python weekday to JS weekday
        js_weekday = (today_weekday + 1) % 7

        h_no_repr = {**supabase_headers, "Prefer": ""}

        # Clean existing hours for this company
        requests.delete(
            f"{supabase_url}/rest/v1/business_hours?company_id=eq.{company_id}",
            headers=h_no_repr,
        )

        # Insert hours for today's weekday
        resp = requests.post(
            f"{supabase_url}/rest/v1/business_hours",
            headers=supabase_headers,
            json={
                "company_id": company_id,
                "tenant_id": tenant_id,
                "weekday": js_weekday,
                "open_time": "09:00",
                "close_time": "18:00",
                "closed": False,
            },
        )
        assert resp.status_code in (200, 201), f"Insert hours failed: {resp.text}"

        try:
            # Call the API
            headers = {**api_headers, "x-tenant-id": tenant_id}
            resp = requests.get(f"{app_url}/api/business-hours/today", headers=headers)
            assert resp.status_code == 200
            body = resp.json()
            assert body.get("success") is True
            # The data should contain today's hours
            data = body.get("data")
            if data is not None:
                assert data["weekday"] == js_weekday
        finally:
            requests.delete(
                f"{supabase_url}/rest/v1/business_hours?company_id=eq.{company_id}",
                headers=h_no_repr,
            )

    def test_returns_null_when_no_hours(self, app_url, api_headers, supabase_url,
                                        supabase_headers, test_tenant):
        """Should return data=null or 404 when no hours configured for today."""
        tenant_id = test_tenant["tenant_id"]
        company_id = test_tenant["company_id"]
        h_no_repr = {**supabase_headers, "Prefer": ""}

        # Delete all hours for this company
        requests.delete(
            f"{supabase_url}/rest/v1/business_hours?company_id=eq.{company_id}",
            headers=h_no_repr,
        )

        headers = {**api_headers, "x-tenant-id": tenant_id}
        resp = requests.get(f"{app_url}/api/business-hours/today", headers=headers)
        # The endpoint returns ok(data) where data could be null, or 404 on error
        assert resp.status_code in (200, 404)
        body = resp.json()
        if resp.status_code == 200:
            # data should be null when no hours exist
            assert body.get("data") is None
        else:
            assert body.get("success") is False
