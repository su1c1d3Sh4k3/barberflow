"""Frontend tests for the Login page (/login)."""
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

APP_URL = "http://localhost:3000"


@pytest.mark.frontend
class TestLoginPage:
    """Tests for the login page rendering and elements."""

    def test_login_page_renders(self, driver):
        """Login page should load and contain BarberFlow in the title."""
        driver.get(f"{APP_URL}/login")
        assert "BarberFlow" in driver.title, (
            f"Expected 'BarberFlow' in page title, got: '{driver.title}'"
        )

    def test_login_form_elements(self, driver):
        """Login form should have email input, password input, and submit button."""
        driver.get(f"{APP_URL}/login")

        email_input = driver.find_element(By.CSS_SELECTOR, "input[type='email']")
        assert email_input is not None, "Email input field not found"

        password_input = driver.find_element(By.CSS_SELECTOR, "input[type='password']")
        assert password_input is not None, "Password input field not found"

        submit_button = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
        assert submit_button is not None, "Submit button not found"

    def test_login_eye_toggle(self, driver):
        """Password field should have a visibility toggle button."""
        driver.get(f"{APP_URL}/login")

        # Look for an eye toggle button near the password field
        toggle = driver.find_elements(By.CSS_SELECTOR,
            "button[aria-label*='password'], button[aria-label*='senha'], "
            "button[data-testid='toggle-password'], "
            "[class*='eye'], [class*='toggle-password']"
        )
        assert len(toggle) > 0, "Password visibility toggle button not found"

    def test_login_google_button(self, driver):
        """Google login button should exist on the login page."""
        driver.get(f"{APP_URL}/login")

        google_buttons = driver.find_elements(By.XPATH,
            "//*[contains(text(), 'Google') or contains(@aria-label, 'Google')]"
        )
        assert len(google_buttons) > 0, "Google login button not found"

    def test_login_signup_link(self, driver):
        """A link to the signup page should exist with text 'Cadastre-se'."""
        driver.get(f"{APP_URL}/login")

        link = driver.find_element(By.XPATH, "//a[contains(text(), 'Cadastre-se')]")
        assert link is not None, "'Cadastre-se' link not found"
        href = link.get_attribute("href")
        assert "/signup" in href, f"Expected link to /signup, got: {href}"

    def test_login_right_panel(self, driver):
        """On large viewports, a decorative panel with gradient should exist."""
        driver.get(f"{APP_URL}/login")

        # Look for a panel with gradient styling (right side decorative panel)
        panels = driver.find_elements(By.CSS_SELECTOR,
            "[class*='gradient'], [class*='right-panel'], "
            "[class*='decorative'], [style*='gradient']"
        )
        assert len(panels) > 0, "Decorative gradient panel not found on login page"
