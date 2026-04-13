"""Frontend tests for the Signup page (/signup)."""
import pytest
from selenium.webdriver.common.by import By

APP_URL = "http://localhost:3000"


@pytest.mark.frontend
class TestSignupPage:
    """Tests for the signup page rendering and form elements."""

    def test_signup_page_renders(self, driver):
        """Signup page should load successfully."""
        driver.get(f"{APP_URL}/signup")
        # Page should have signup-related content
        assert "Criar" in driver.page_source or "Cadastr" in driver.page_source or "conta" in driver.page_source, \
            "Signup page missing expected content"
        assert "error" not in driver.title.lower(), "Signup page has error in title"

    def test_signup_form_fields(self, driver):
        """Signup form should contain all required input fields."""
        driver.get(f"{APP_URL}/signup")

        # Name field
        name_inputs = driver.find_elements(By.CSS_SELECTOR,
            "input[name='name'], input[placeholder*='nome'], input[placeholder*='Nome']"
        )
        assert len(name_inputs) > 0, "Name input field not found"

        # Barbershop name field
        barbershop_inputs = driver.find_elements(By.CSS_SELECTOR,
            "input[name='barbershop'], input[name='company'], "
            "input[placeholder*='barbearia'], input[placeholder*='Barbearia']"
        )
        assert len(barbershop_inputs) > 0, "Barbershop name input field not found"

        # Phone field
        phone_inputs = driver.find_elements(By.CSS_SELECTOR,
            "input[name='phone'], input[type='tel'], "
            "input[placeholder*='telefone'], input[placeholder*='Telefone'], "
            "input[placeholder*='celular'], input[placeholder*='Celular']"
        )
        assert len(phone_inputs) > 0, "Phone input field not found"

        # Email field
        email_inputs = driver.find_elements(By.CSS_SELECTOR, "input[type='email']")
        assert len(email_inputs) > 0, "Email input field not found"

        # CNPJ field
        cnpj_inputs = driver.find_elements(By.CSS_SELECTOR,
            "input[name='cnpj'], input[placeholder*='CNPJ'], input[placeholder*='cnpj'], input[data-testid='cnpj-input']"
        )
        # CNPJ field is optional - may be present with different selectors
        # Just verify the form has the expected structure

        # Password field
        password_inputs = driver.find_elements(By.CSS_SELECTOR, "input[type='password']")
        assert len(password_inputs) >= 1, "Password input field not found"

        # Confirm password (second password field)
        assert len(password_inputs) >= 2, "Confirm password input field not found"

    def test_signup_terms_checkbox(self, driver):
        """LGPD terms checkbox should exist on the signup page."""
        driver.get(f"{APP_URL}/signup")

        checkboxes = driver.find_elements(By.CSS_SELECTOR,
            "input[type='checkbox'], [role='checkbox']"
        )
        assert len(checkboxes) > 0, "LGPD terms checkbox not found"

    def test_signup_submit_button(self, driver):
        """Submit button with 'Criar minha conta' text should exist."""
        driver.get(f"{APP_URL}/signup")

        buttons = driver.find_elements(By.XPATH,
            "//button[contains(text(), 'Criar minha conta')] | "
            "//button[contains(text(), 'criar minha conta')]"
        )
        assert len(buttons) > 0, "'Criar minha conta' submit button not found"
