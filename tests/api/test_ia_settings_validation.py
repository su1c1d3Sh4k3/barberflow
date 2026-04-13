"""
Tests for Zod validation on /api/ia-settings endpoint.
"""
import requests
import pytest


class TestIASettingsZodValidation:
    """Verify Zod schema enforcement on ia-settings PUT."""

    def _headers(self, api_headers, test_tenant):
        return {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

    def test_rejects_invalid_tone(self, app_url, api_headers, test_tenant):
        """Invalid tone value → 422."""
        resp = requests.put(
            f"{app_url}/api/ia-settings",
            headers=self._headers(api_headers, test_tenant),
            json={"tone": "amigavel"},
        )
        assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"

    def test_rejects_instructions_too_long(self, app_url, api_headers, test_tenant):
        """Instructions > 2000 chars → 422."""
        resp = requests.put(
            f"{app_url}/api/ia-settings",
            headers=self._headers(api_headers, test_tenant),
            json={"instructions": "x" * 2001},
        )
        assert resp.status_code == 422

    def test_rejects_invalid_knowledge_base_url(self, app_url, api_headers, test_tenant):
        """Invalid URL for knowledge_base_url → 422."""
        resp = requests.put(
            f"{app_url}/api/ia-settings",
            headers=self._headers(api_headers, test_tenant),
            json={"knowledge_base_url": "not-a-url"},
        )
        assert resp.status_code == 422

    def test_rejects_enabled_not_boolean(self, app_url, api_headers, test_tenant):
        """enabled as string → 422."""
        resp = requests.put(
            f"{app_url}/api/ia-settings",
            headers=self._headers(api_headers, test_tenant),
            json={"enabled": "yes"},
        )
        assert resp.status_code == 422

    def test_rejects_test_numbers_not_array(self, app_url, api_headers, test_tenant):
        """test_numbers as string → 422."""
        resp = requests.put(
            f"{app_url}/api/ia-settings",
            headers=self._headers(api_headers, test_tenant),
            json={"test_numbers": "5511999990001"},
        )
        assert resp.status_code == 422

    def test_accepts_valid_settings(self, app_url, api_headers, test_tenant):
        """Valid full payload → 200."""
        resp = requests.put(
            f"{app_url}/api/ia-settings",
            headers=self._headers(api_headers, test_tenant),
            json={
                "enabled": True,
                "tone": "educado",
                "instructions": "Seja prestativo.",
                "test_mode": False,
                "test_numbers": ["5511999990001"],
                "handoff_keywords": ["atendente", "humano"],
            },
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json().get("data", {})
        assert data.get("enabled") is True
        assert data.get("tone") == "educado"

    def test_accepts_empty_knowledge_url(self, app_url, api_headers, test_tenant):
        """Empty string knowledge_base_url → accepted (clears the field)."""
        resp = requests.put(
            f"{app_url}/api/ia-settings",
            headers=self._headers(api_headers, test_tenant),
            json={"knowledge_base_url": ""},
        )
        assert resp.status_code == 200

    def test_accepts_null_knowledge_url(self, app_url, api_headers, test_tenant):
        """null knowledge_base_url → accepted."""
        resp = requests.put(
            f"{app_url}/api/ia-settings",
            headers=self._headers(api_headers, test_tenant),
            json={"knowledge_base_url": None},
        )
        assert resp.status_code == 200

    def test_still_ignores_unknown_fields(self, app_url, api_headers, test_tenant):
        """Unknown fields should be stripped by Zod (strict isn't applied)."""
        resp = requests.put(
            f"{app_url}/api/ia-settings",
            headers=self._headers(api_headers, test_tenant),
            json={"enabled": True, "malicious_field": "DROP TABLE"},
        )
        assert resp.status_code == 200
        data = resp.json().get("data", {})
        assert "malicious_field" not in data
