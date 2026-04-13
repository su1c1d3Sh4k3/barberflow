"""Frontend tests for the Definicoes (Settings) pages."""
import pytest
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

APP_URL = "http://localhost:3000"


@pytest.mark.frontend
class TestDefinicoesPage:
    """Tests for definicoes pages access control."""

    def test_definicoes_redirects_without_auth(self, driver):
        """Unauthenticated access to /definicoes should redirect to /login."""
        driver.get(f"{APP_URL}/definicoes")
        WebDriverWait(driver, 10).until(EC.url_contains("/login"))
        assert "/login" in driver.current_url, (
            f"Expected redirect to /login, got: {driver.current_url}"
        )

    def test_definicoes_ia_redirects_without_auth(self, driver):
        """Unauthenticated access to /definicoes/ia should redirect to /login."""
        driver.get(f"{APP_URL}/definicoes/ia")
        WebDriverWait(driver, 10).until(EC.url_contains("/login"))
        assert "/login" in driver.current_url, (
            f"Expected redirect to /login, got: {driver.current_url}"
        )
