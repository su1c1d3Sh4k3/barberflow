"""
Tests for Zod validation on /api/messages/log endpoint.
"""
import requests
import pytest
import uuid


class TestMessagesLogZodValidation:
    """Verify Zod schema enforcement on message logging."""

    def _headers(self, api_headers, test_tenant):
        return {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

    def _make_contact(self, app_url, headers, tenant_id):
        """Create a test contact with unique phone and return its id."""
        unique_phone = f"55119{uuid.uuid4().hex[:8]}"
        resp = requests.post(
            f"{app_url}/api/contacts",
            headers=headers,
            json={
                "name": "Msg Test Contact",
                "phone": unique_phone,
            },
        )
        assert resp.status_code in (200, 201), f"Failed to create contact: {resp.text}"
        return resp.json()["data"]["id"]

    def test_requires_auth(self, app_url):
        """POST /api/messages/log without auth → 401."""
        resp = requests.post(
            f"{app_url}/api/messages/log",
            json={"contact_id": str(uuid.uuid4()), "direction": "inbound", "content": "Oi"},
        )
        assert resp.status_code == 401

    def test_rejects_missing_contact_id(self, app_url, api_headers, test_tenant):
        """Missing contact_id → 422."""
        resp = requests.post(
            f"{app_url}/api/messages/log",
            headers=self._headers(api_headers, test_tenant),
            json={"direction": "inbound", "content": "Oi"},
        )
        assert resp.status_code == 422

    def test_rejects_invalid_contact_id(self, app_url, api_headers, test_tenant):
        """Non-UUID contact_id → 422."""
        resp = requests.post(
            f"{app_url}/api/messages/log",
            headers=self._headers(api_headers, test_tenant),
            json={"contact_id": "not-a-uuid", "direction": "inbound", "content": "Oi"},
        )
        assert resp.status_code == 422

    def test_rejects_invalid_direction(self, app_url, api_headers, test_tenant):
        """Invalid direction → 422."""
        resp = requests.post(
            f"{app_url}/api/messages/log",
            headers=self._headers(api_headers, test_tenant),
            json={
                "contact_id": str(uuid.uuid4()),
                "direction": "sideways",
                "content": "Oi",
            },
        )
        assert resp.status_code == 422

    def test_rejects_empty_content(self, app_url, api_headers, test_tenant):
        """Empty content → 422."""
        resp = requests.post(
            f"{app_url}/api/messages/log",
            headers=self._headers(api_headers, test_tenant),
            json={
                "contact_id": str(uuid.uuid4()),
                "direction": "inbound",
                "content": "",
            },
        )
        assert resp.status_code == 422

    def test_rejects_missing_content(self, app_url, api_headers, test_tenant):
        """Missing content → 422."""
        resp = requests.post(
            f"{app_url}/api/messages/log",
            headers=self._headers(api_headers, test_tenant),
            json={
                "contact_id": str(uuid.uuid4()),
                "direction": "outbound",
            },
        )
        assert resp.status_code == 422

    def test_accepts_valid_inbound_message(self, app_url, api_headers, test_tenant):
        """Valid inbound message → 201."""
        headers = self._headers(api_headers, test_tenant)
        contact_id = self._make_contact(app_url, headers, test_tenant["tenant_id"])

        resp = requests.post(
            f"{app_url}/api/messages/log",
            headers=headers,
            json={
                "contact_id": contact_id,
                "direction": "inbound",
                "content": "Quero agendar um corte",
            },
        )
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
        data = resp.json()["data"]
        assert data["direction"] == "in"
        assert data["content"] == "Quero agendar um corte"

    def test_accepts_valid_outbound_message(self, app_url, api_headers, test_tenant):
        """Valid outbound message → 201."""
        headers = self._headers(api_headers, test_tenant)
        contact_id = self._make_contact(app_url, headers, test_tenant["tenant_id"])

        resp = requests.post(
            f"{app_url}/api/messages/log",
            headers=headers,
            json={
                "contact_id": contact_id,
                "direction": "outbound",
                "content": "Seu agendamento foi confirmado!",
                "sent_by": "ia",
            },
        )
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
        data = resp.json()["data"]
        assert data["direction"] == "out"
        assert data["sent_by"] == "ia"
