"""
Tests for /api/token-usage endpoint — token consumption tracking.
"""
import requests
import pytest


class TestTokenUsageAPI:
    """Verify token usage tracking endpoint."""

    def test_get_requires_auth(self, app_url):
        """GET /api/token-usage without auth should return 401."""
        resp = requests.get(f"{app_url}/api/token-usage")
        assert resp.status_code == 401

    def test_post_requires_auth(self, app_url):
        """POST /api/token-usage without auth should return 401."""
        resp = requests.post(
            f"{app_url}/api/token-usage",
            json={"tokens_input": 100, "tokens_output": 50},
        )
        assert resp.status_code == 401

    def test_get_empty_usage(self, app_url, api_headers, test_tenant):
        """GET /api/token-usage should return empty ledger initially."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/token-usage", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        data = body.get("data", {})
        assert "ledger" in data
        assert "current_period" in data

    def test_track_token_usage(self, app_url, api_headers, test_tenant):
        """POST /api/token-usage should record token consumption."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/token-usage",
            headers=headers,
            json={"tokens_input": 1000, "tokens_output": 500},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body.get("success") is True
        data = body.get("data", {})
        assert data.get("tokens_input") >= 1000
        assert data.get("tokens_output") >= 500
        assert data.get("estimated_cost") > 0

    def test_token_usage_accumulates(self, app_url, api_headers, test_tenant):
        """Multiple POST calls should accumulate tokens in same period."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        # First call
        resp1 = requests.post(
            f"{app_url}/api/token-usage",
            headers=headers,
            json={"tokens_input": 500, "tokens_output": 200},
        )
        assert resp1.status_code == 201
        first = resp1.json()["data"]

        # Second call
        resp2 = requests.post(
            f"{app_url}/api/token-usage",
            headers=headers,
            json={"tokens_input": 300, "tokens_output": 100},
        )
        assert resp2.status_code == 201
        second = resp2.json()["data"]

        # Should have accumulated
        assert second["tokens_input"] >= first["tokens_input"] + 300
        assert second["tokens_output"] >= first["tokens_output"] + 100

    def test_token_usage_invalid_input(self, app_url, api_headers, test_tenant):
        """POST with invalid input should return 422."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.post(
            f"{app_url}/api/token-usage",
            headers=headers,
            json={"tokens_input": "not a number", "tokens_output": 50},
        )
        assert resp.status_code == 422

    def test_token_usage_shows_in_ledger(self, app_url, api_headers, test_tenant):
        """After tracking, GET should show usage in ledger."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        # Track some usage first
        requests.post(
            f"{app_url}/api/token-usage",
            headers=headers,
            json={"tokens_input": 100, "tokens_output": 50},
        )

        # Get ledger
        resp = requests.get(f"{app_url}/api/token-usage", headers=headers)
        assert resp.status_code == 200
        data = resp.json().get("data", {})
        ledger = data.get("ledger", [])
        assert len(ledger) >= 1
        assert ledger[0].get("tokens_input") > 0
