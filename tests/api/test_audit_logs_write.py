"""
Tests that audit logs are actually written by API operations.
"""
import requests
import pytest
import uuid
import time


class TestAuditLogsWrite:
    """Verify that CRUD operations write to audit_logs."""

    def _headers(self, api_headers, test_tenant):
        return {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

    def _get_audit_logs(self, app_url, headers, entity=None):
        url = f"{app_url}/api/audit-logs"
        if entity:
            url += f"?entity={entity}"
        resp = requests.get(url, headers=headers)
        assert resp.status_code == 200
        return resp.json().get("data", [])

    def test_holiday_create_writes_audit(self, app_url, api_headers, test_tenant):
        """Creating a holiday should log an audit entry."""
        headers = self._headers(api_headers, test_tenant)
        # Create holiday
        requests.post(
            f"{app_url}/api/holidays",
            headers=headers,
            json={
                "company_id": test_tenant["company_id"],
                "date": "2026-11-15",
                "name": "Proclamacao",
            },
        )
        time.sleep(0.5)

        logs = self._get_audit_logs(app_url, headers, entity="holiday")
        assert any(
            l.get("action") == "create" and l.get("entity") == "holiday"
            for l in logs
        ), f"Expected audit log for holiday create, got {logs}"

    def test_appointment_cancel_writes_audit(self, app_url, api_headers, test_tenant, supabase_url, supabase_headers):
        """Canceling an appointment should write audit log."""
        headers = self._headers(api_headers, test_tenant)
        tid = test_tenant["tenant_id"]
        cid = test_tenant["company_id"]

        # Create test data via Supabase REST
        h = supabase_headers

        # Professional
        r = requests.post(f"{supabase_url}/rest/v1/professionals", headers=h, json={
            "tenant_id": tid, "company_id": cid, "name": "Audit Test Pro", "active": True,
        })
        pro_id = (r.json()[0] if isinstance(r.json(), list) else r.json())["id"]

        # Contact
        phone = f"55119{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{supabase_url}/rest/v1/contacts", headers=h, json={
            "tenant_id": tid, "name": "Audit Contact", "phone": phone,
        })
        contact_id = (r.json()[0] if isinstance(r.json(), list) else r.json())["id"]

        # Appointment
        from datetime import datetime, timedelta, timezone
        start = (datetime.now(timezone.utc) + timedelta(days=2)).replace(hour=10, minute=0).isoformat()
        end = (datetime.now(timezone.utc) + timedelta(days=2)).replace(hour=10, minute=30).isoformat()
        r = requests.post(f"{supabase_url}/rest/v1/appointments", headers=h, json={
            "tenant_id": tid, "company_id": cid, "contact_id": contact_id,
            "professional_id": pro_id, "start_at": start, "end_at": end,
            "status": "pendente", "total_price": 50,
        })
        apt_id = (r.json()[0] if isinstance(r.json(), list) else r.json())["id"]

        # Cancel via API
        cancel_resp = requests.post(
            f"{app_url}/api/appointments/{apt_id}/cancel",
            headers=headers,
            json={"reason": "teste"},
        )
        assert cancel_resp.status_code == 200
        time.sleep(0.5)

        logs = self._get_audit_logs(app_url, headers, entity="appointment")
        assert any(
            l.get("action") == "cancel" and l.get("entity_id") == apt_id
            for l in logs
        ), f"Expected audit log for cancel, got {logs}"

    def test_contact_create_writes_audit(self, app_url, api_headers, test_tenant):
        """Creating a contact should write audit log."""
        headers = self._headers(api_headers, test_tenant)
        phone = f"55119{uuid.uuid4().hex[:8]}"
        requests.post(
            f"{app_url}/api/contacts",
            headers=headers,
            json={"name": "Audit Test", "phone": phone},
        )
        time.sleep(0.5)

        logs = self._get_audit_logs(app_url, headers, entity="contact")
        assert any(
            l.get("action") == "create" and l.get("entity") == "contact"
            for l in logs
        ), f"Expected audit log for contact create, got {logs}"
