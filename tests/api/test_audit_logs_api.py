"""
Tests for /api/audit-logs endpoint.
"""
import requests
import pytest
import uuid


class TestAuditLogsAPI:
    """Verify audit log CRUD endpoint."""

    def test_get_requires_auth(self, app_url):
        """GET /api/audit-logs without auth should return 401."""
        resp = requests.get(f"{app_url}/api/audit-logs")
        assert resp.status_code == 401

    def test_post_requires_auth(self, app_url):
        """POST /api/audit-logs without auth should return 401."""
        resp = requests.post(
            f"{app_url}/api/audit-logs",
            json={"action": "test", "entity": "test"},
        )
        assert resp.status_code == 401

    def test_get_empty_logs(self, app_url, api_headers, test_tenant):
        """GET /api/audit-logs should return list."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/audit-logs", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert isinstance(body.get("data"), list)

    def test_create_audit_log(self, app_url, api_headers, test_tenant):
        """POST /api/audit-logs should create a log entry."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/audit-logs",
            headers=headers,
            json={
                "action": "updated",
                "entity": "contact",
                "entity_id": str(uuid.uuid4()),
                "metadata": {"field": "name", "old": "Old Name", "new": "New Name"},
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body.get("success") is True
        data = body.get("data", {})
        assert data.get("action") == "updated"
        assert data.get("entity") == "contact"

    def test_audit_log_missing_fields(self, app_url, api_headers, test_tenant):
        """POST /api/audit-logs without required fields should return 422."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/audit-logs",
            headers=headers,
            json={"metadata": {"some": "data"}},
        )
        assert resp.status_code == 422

    def test_audit_log_filter_by_entity(self, app_url, api_headers, test_tenant):
        """GET /api/audit-logs?entity=contact should filter."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        # Create entries for different entities
        requests.post(
            f"{app_url}/api/audit-logs",
            headers=headers,
            json={"action": "created", "entity": "appointment"},
        )
        requests.post(
            f"{app_url}/api/audit-logs",
            headers=headers,
            json={"action": "created", "entity": "contact"},
        )

        # Filter by entity
        resp = requests.get(f"{app_url}/api/audit-logs?entity=appointment", headers=headers)
        assert resp.status_code == 200
        logs = resp.json().get("data", [])
        for log in logs:
            assert log["entity"] == "appointment"

    def test_audit_log_pagination(self, app_url, api_headers, test_tenant):
        """GET /api/audit-logs with limit/offset should paginate."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/audit-logs?limit=5&offset=0", headers=headers)
        assert resp.status_code == 200
        logs = resp.json().get("data", [])
        assert len(logs) <= 5
