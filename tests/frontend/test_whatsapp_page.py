"""Frontend tests for the WhatsApp page."""
import pytest
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

APP_URL = "http://localhost:3000"


@pytest.mark.frontend
class TestWhatsAppPage:
    """Tests for WhatsApp page access control."""

    def test_whatsapp_redirects_without_auth(self, driver):
        """Unauthenticated access to /whatsapp should redirect to /login."""
        driver.get(f"{APP_URL}/whatsapp")
        WebDriverWait(driver, 10).until(EC.url_contains("/login"))
        assert "/login" in driver.current_url, (
            f"Expected redirect to /login, got: {driver.current_url}"
        )
