"""Frontend tests for the Dashboard page (/dashboard)."""
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

APP_URL = "http://localhost:3000"


@pytest.mark.frontend
class TestDashboardPage:
    """Tests for the dashboard page access control."""

    def test_dashboard_redirects_without_auth(self, driver):
        """Accessing /dashboard without authentication should redirect to /login."""
        driver.get(f"{APP_URL}/dashboard")

        # Wait for redirect to complete
        WebDriverWait(driver, 10).until(
            EC.url_contains("/login")
        )

        current_url = driver.current_url
        assert "/login" in current_url, (
            f"Expected redirect to /login, but current URL is: {current_url}"
        )
