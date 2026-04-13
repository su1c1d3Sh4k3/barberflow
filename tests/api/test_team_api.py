"""
Tests for /api/team endpoint (team members / invites).
"""
import requests
import pytest
import uuid


class TestTeamAPI:
    """Team member listing and invitation."""

    def _headers(self, api_headers, test_tenant):
        return {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

    def test_list_requires_auth(self, app_url):
        resp = requests.get(f"{app_url}/api/team")
        assert resp.status_code == 401

    def test_list_team_members(self, app_url, api_headers, test_tenant):
        resp = requests.get(
            f"{app_url}/api/team",
            headers=self._headers(api_headers, test_tenant),
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        assert isinstance(resp.json()["data"], list)

    def test_invite_requires_auth(self, app_url):
        resp = requests.post(
            f"{app_url}/api/team",
            json={"email": "test@example.com", "role": "admin"},
        )
        assert resp.status_code == 401

    def test_invite_requires_email(self, app_url, api_headers, test_tenant):
        resp = requests.post(
            f"{app_url}/api/team",
            headers=self._headers(api_headers, test_tenant),
            json={"role": "admin"},
        )
        assert resp.status_code == 422

    def test_invite_member(self, app_url, api_headers, test_tenant):
        email = f"team_{uuid.uuid4().hex[:8]}@test.com"
        resp = requests.post(
            f"{app_url}/api/team",
            headers=self._headers(api_headers, test_tenant),
            json={"email": email, "role": "professional"},
        )
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
        data = resp.json()["data"]
        assert data["email"] == email
        assert data["role"] == "professional"
        assert data["status"] == "pending"

    def test_invite_duplicate_email(self, app_url, api_headers, test_tenant):
        email = f"dup_{uuid.uuid4().hex[:8]}@test.com"
        headers = self._headers(api_headers, test_tenant)
        # First invite
        resp1 = requests.post(f"{app_url}/api/team", headers=headers, json={"email": email, "role": "admin"})
        assert resp1.status_code == 201
        # Second invite same email
        resp2 = requests.post(f"{app_url}/api/team", headers=headers, json={"email": email, "role": "admin"})
        assert resp2.status_code == 409

    def test_invite_invalid_role_defaults(self, app_url, api_headers, test_tenant):
        email = f"role_{uuid.uuid4().hex[:8]}@test.com"
        resp = requests.post(
            f"{app_url}/api/team",
            headers=self._headers(api_headers, test_tenant),
            json={"email": email, "role": "superadmin"},
        )
        assert resp.status_code == 201
        assert resp.json()["data"]["role"] == "professional"
