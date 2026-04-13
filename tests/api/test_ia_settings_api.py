"""
Tests for /api/ia-settings endpoint.
"""
import requests
import pytest


class TestIASettingsAPI:
    """Verify IA settings CRUD endpoint."""

    def test_get_requires_auth(self, app_url):
        """GET /api/ia-settings without auth should return 401."""
        resp = requests.get(f"{app_url}/api/ia-settings")
        assert resp.status_code == 401

    def test_get_ia_settings(self, app_url, api_headers, test_tenant):
        """GET /api/ia-settings should return settings or null."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/ia-settings", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

    def test_put_requires_auth(self, app_url):
        """PUT /api/ia-settings without auth should return 401."""
        resp = requests.put(
            f"{app_url}/api/ia-settings",
            json={"enabled": True},
        )
        assert resp.status_code == 401

    def test_create_ia_settings(self, app_url, api_headers, test_tenant):
        """PUT /api/ia-settings should upsert settings."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.put(
            f"{app_url}/api/ia-settings",
            headers=headers,
            json={
                "enabled": True,
                "tone": "simpatico",
                "instructions": "Seja prestativo e educado.",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        data = body.get("data", {})
        assert data.get("enabled") is True
        assert data.get("tone") == "simpatico"

    def test_update_ia_settings(self, app_url, api_headers, test_tenant):
        """PUT /api/ia-settings should update existing settings."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        # Update tone
        resp = requests.put(
            f"{app_url}/api/ia-settings",
            headers=headers,
            json={"tone": "formal"},
        )
        assert resp.status_code == 200
        data = resp.json().get("data", {})
        assert data.get("tone") == "formal"

    def test_ia_settings_test_mode(self, app_url, api_headers, test_tenant):
        """Should be able to enable test mode with test numbers."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.put(
            f"{app_url}/api/ia-settings",
            headers=headers,
            json={
                "test_mode": True,
                "test_numbers": ["5511999990001", "5511999990002"],
            },
        )
        assert resp.status_code == 200
        data = resp.json().get("data", {})
        assert data.get("test_mode") is True
        assert len(data.get("test_numbers", [])) == 2

    def test_ia_settings_handoff_keywords(self, app_url, api_headers, test_tenant):
        """Should be able to set handoff keywords."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.put(
            f"{app_url}/api/ia-settings",
            headers=headers,
            json={"handoff_keywords": ["atendente", "humano", "pessoa"]},
        )
        assert resp.status_code == 200
        data = resp.json().get("data", {})
        assert "atendente" in data.get("handoff_keywords", [])

    def test_ia_settings_ignores_unknown_fields(self, app_url, api_headers, test_tenant):
        """PUT should ignore fields not in allowedFields."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.put(
            f"{app_url}/api/ia-settings",
            headers=headers,
            json={"enabled": True, "malicious_field": "DROP TABLE"},
        )
        assert resp.status_code == 200
