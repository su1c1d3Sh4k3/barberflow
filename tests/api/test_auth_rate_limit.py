"""
Tests for server-side login rate limiting per IP.
Endpoint: POST /api/auth/rate-check
"""
import requests
import pytest


class TestAuthRateLimit:
    """Server-side rate limit per IP on login attempts."""

    def test_rate_check_allowed_first_attempt(self, app_url):
        """First login attempt from an IP should be allowed."""
        resp = requests.post(
            f"{app_url}/api/auth/rate-check",
            json={"email": "rate-test-first@example.com"},
            headers={"X-Forwarded-For": "10.99.1.1"},
        )
        assert resp.status_code == 200, (
            f"Expected 200 on first attempt, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert data["allowed"] is True

    def test_rate_check_allowed_under_limit(self, app_url):
        """Attempts under the limit (5) should all be allowed."""
        ip = "10.99.2.1"
        for i in range(5):
            resp = requests.post(
                f"{app_url}/api/auth/rate-check",
                json={"email": f"rate-test-under-{i}@example.com"},
                headers={"X-Forwarded-For": ip},
            )
            assert resp.status_code == 200, (
                f"Attempt {i+1} should be allowed, got {resp.status_code}: {resp.text}"
            )
            data = resp.json()
            assert data["allowed"] is True

    def test_rate_check_blocked_after_5(self, app_url):
        """6th attempt from the same IP within 15 min should be blocked with 429."""
        ip = "10.99.3.1"
        # Make 5 allowed attempts
        for i in range(5):
            resp = requests.post(
                f"{app_url}/api/auth/rate-check",
                json={"email": f"rate-block-{i}@example.com"},
                headers={"X-Forwarded-For": ip},
            )
            assert resp.status_code == 200

        # 6th attempt should be blocked
        resp = requests.post(
            f"{app_url}/api/auth/rate-check",
            json={"email": "rate-block-6@example.com"},
            headers={"X-Forwarded-For": ip},
        )
        assert resp.status_code == 429, (
            f"Expected 429 after 5 attempts, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert data["allowed"] is False

    def test_rate_check_retry_after_header(self, app_url):
        """Blocked response should include Retry-After header."""
        ip = "10.99.4.1"
        for i in range(6):
            resp = requests.post(
                f"{app_url}/api/auth/rate-check",
                json={"email": f"retry-header-{i}@example.com"},
                headers={"X-Forwarded-For": ip},
            )

        # The 6th response should have Retry-After
        assert resp.status_code == 429
        assert "Retry-After" in resp.headers, (
            "Response should include Retry-After header"
        )
        retry_after = int(resp.headers["Retry-After"])
        assert retry_after > 0, "Retry-After should be positive"
        assert retry_after <= 900, "Retry-After should not exceed 15 minutes (900s)"

    def test_rate_check_retry_after_in_body(self, app_url):
        """Blocked response body should include retryAfter field."""
        ip = "10.99.5.1"
        for i in range(6):
            resp = requests.post(
                f"{app_url}/api/auth/rate-check",
                json={"email": f"retry-body-{i}@example.com"},
                headers={"X-Forwarded-For": ip},
            )

        data = resp.json()
        assert "retryAfter" in data, "Body should include retryAfter"
        assert isinstance(data["retryAfter"], int)
        assert data["retryAfter"] > 0

    def test_rate_check_different_ips_independent(self, app_url):
        """Different IPs should have independent rate limits."""
        ip_a = "10.99.6.1"
        ip_b = "10.99.6.2"

        # Exhaust ip_a
        for i in range(6):
            requests.post(
                f"{app_url}/api/auth/rate-check",
                json={"email": f"indep-a-{i}@example.com"},
                headers={"X-Forwarded-For": ip_a},
            )

        # ip_b should still be allowed
        resp = requests.post(
            f"{app_url}/api/auth/rate-check",
            json={"email": "indep-b@example.com"},
            headers={"X-Forwarded-For": ip_b},
        )
        assert resp.status_code == 200
        assert resp.json()["allowed"] is True

    def test_rate_check_missing_email(self, app_url):
        """Request without email should return 400."""
        resp = requests.post(
            f"{app_url}/api/auth/rate-check",
            json={},
            headers={"X-Forwarded-For": "10.99.7.1"},
        )
        assert resp.status_code == 400

    def test_rate_check_invalid_json(self, app_url):
        """Request with invalid JSON should return 400."""
        resp = requests.post(
            f"{app_url}/api/auth/rate-check",
            data="not json",
            headers={
                "Content-Type": "application/json",
                "X-Forwarded-For": "10.99.8.1",
            },
        )
        assert resp.status_code == 400
