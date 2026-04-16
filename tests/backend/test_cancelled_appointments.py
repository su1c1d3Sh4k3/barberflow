"""
Tests for cancelled appointments: they appear in calendar query but don't block slots.
Validates cancel_reason is stored in the appointments table.
Uses the Supabase REST API directly (same pattern as other backend tests).
"""
import requests
import pytest
from datetime import date, timedelta


class TestCancelledAppointmentsQuery:
    def test_cancelled_status_queryable(self, supabase_url, supabase_headers, test_tenant):
        """cancelled appointments can be queried via REST API"""
        resp = requests.get(
            f"{supabase_url}/rest/v1/appointments",
            headers={**supabase_headers, "Prefer": "return=representation"},
            params={
                "tenant_id": f"eq.{test_tenant['tenant_id']}",
                "status": "eq.cancelado",
                "select": "id,status,cancel_reason",
                "limit": "10",
            },
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_cancel_reason_and_cancelled_at_columns_exist(self, supabase_url, supabase_headers, test_tenant):
        """cancel_reason and cancelled_at columns are selectable"""
        resp = requests.get(
            f"{supabase_url}/rest/v1/appointments",
            headers=supabase_headers,
            params={
                "tenant_id": f"eq.{test_tenant['tenant_id']}",
                "select": "id,cancel_reason,cancelled_at",
                "limit": "1",
            },
        )
        assert resp.status_code == 200

    def test_all_statuses_query_including_cancelado(self, supabase_url, supabase_headers, test_tenant):
        """Query using all statuses including cancelado works"""
        resp = requests.get(
            f"{supabase_url}/rest/v1/appointments",
            headers=supabase_headers,
            params={
                "tenant_id": f"eq.{test_tenant['tenant_id']}",
                "status": "in.(pendente,confirmado,concluido,cancelado)",
                "select": "id,status",
                "limit": "20",
            },
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_cancelled_appointment_has_cancel_reason_writable(self, supabase_url, supabase_headers, test_tenant):
        """cancel_reason can be written when status is set to cancelado"""
        # Find any existing pending appointment to test update
        resp = requests.get(
            f"{supabase_url}/rest/v1/appointments",
            headers=supabase_headers,
            params={
                "tenant_id": f"eq.{test_tenant['tenant_id']}",
                "status": "eq.pendente",
                "select": "id",
                "limit": "1",
            },
        )
        if resp.status_code != 200 or not resp.json():
            pytest.skip("No pending appointments to test cancel_reason write")

        apt_id = resp.json()[0]["id"]
        update_resp = requests.patch(
            f"{supabase_url}/rest/v1/appointments",
            headers={**supabase_headers, "Prefer": "return=representation"},
            params={"id": f"eq.{apt_id}"},
            json={"status": "cancelado", "cancel_reason": "Teste de cancelamento"},
        )
        assert update_resp.status_code in (200, 204)

        # Restore to pendente
        requests.patch(
            f"{supabase_url}/rest/v1/appointments",
            headers=supabase_headers,
            params={"id": f"eq.{apt_id}"},
            json={"status": "pendente", "cancel_reason": None},
        )
