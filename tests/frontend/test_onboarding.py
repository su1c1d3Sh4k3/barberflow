"""Frontend tests for the Onboarding Wizard page (/onboarding)."""
import pytest
import requests
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

APP_URL = "http://localhost:3000"


@pytest.mark.frontend
class TestOnboardingPage:
    """Tests for the onboarding wizard page."""

    def test_onboarding_redirects_without_auth(self, driver):
        """Unauthenticated access to /onboarding should redirect to /login."""
        driver.get(f"{APP_URL}/onboarding")
        WebDriverWait(driver, 10).until(EC.url_contains("/login"))
        assert "/login" in driver.current_url, (
            f"Expected redirect to /login, got: {driver.current_url}"
        )

    def test_onboarding_page_renders(self):
        """GET /onboarding should return 200 or 307 (redirect)."""
        resp = requests.get(f"{APP_URL}/onboarding", allow_redirects=False)
        assert resp.status_code in (200, 307, 302), (
            f"Expected 200 or redirect, got: {resp.status_code}"
        )
