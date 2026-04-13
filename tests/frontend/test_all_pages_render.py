"""Frontend tests that verify pages return HTTP 200 (using requests, no Selenium)."""
import pytest
import requests

APP_URL = "http://localhost:3000"


@pytest.mark.frontend
class TestAllPagesRender:
    """Verify key pages and API endpoints respond with expected status codes."""

    def test_login_renders(self):
        """GET /login should return HTTP 200."""
        resp = requests.get(f"{APP_URL}/login", timeout=10)
        assert resp.status_code == 200, (
            f"Expected 200 for /login, got {resp.status_code}"
        )

    def test_signup_renders(self):
        """GET /signup should return HTTP 200."""
        resp = requests.get(f"{APP_URL}/signup", timeout=10)
        assert resp.status_code == 200, (
            f"Expected 200 for /signup, got {resp.status_code}"
        )

    def test_api_webhook_whatsapp(self):
        """POST /api/webhooks/whatsapp should return HTTP 200."""
        resp = requests.post(
            f"{APP_URL}/api/webhooks/whatsapp",
            json={},
            timeout=10,
        )
        assert resp.status_code == 200, (
            f"Expected 200 for POST /api/webhooks/whatsapp, got {resp.status_code}"
        )

    def test_api_webhook_asaas(self):
        """POST /api/webhooks/asaas without token should return HTTP 401."""
        resp = requests.post(
            f"{APP_URL}/api/webhooks/asaas",
            json={},
            timeout=10,
        )
        assert resp.status_code == 401, (
            f"Expected 401 for POST /api/webhooks/asaas without token, got {resp.status_code}"
        )
