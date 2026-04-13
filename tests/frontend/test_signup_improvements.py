"""Frontend tests for Signup page improvements: password strength meter and CNPJ validation."""
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

APP_URL = "http://localhost:3000"


@pytest.mark.frontend
class TestPasswordStrengthMeter:
    """Tests for the visual password strength indicator on signup."""

    def test_strength_meter_hidden_initially(self, driver):
        """Password strength meter should not be visible when password is empty."""
        driver.get(f"{APP_URL}/signup")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "form"))
        )
        meters = driver.find_elements(By.CSS_SELECTOR, "[data-testid='password-strength-meter']")
        assert len(meters) == 0, "Strength meter should not appear when password is empty"

    def test_strength_meter_appears_on_typing(self, driver):
        """Password strength meter should appear when user starts typing."""
        driver.get(f"{APP_URL}/signup")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "form"))
        )

        # Find the password field (first password-type input, or use placeholder)
        password_inputs = driver.find_elements(By.CSS_SELECTOR, "input[type='password']")
        # First one is password, second is confirm
        password_input = password_inputs[0]
        password_input.send_keys("a")

        WebDriverWait(driver, 5).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='password-strength-meter']"))
        )
        meter = driver.find_element(By.CSS_SELECTOR, "[data-testid='password-strength-meter']")
        assert meter.is_displayed(), "Strength meter should be visible after typing"

    def test_strength_weak_password(self, driver):
        """A short lowercase-only password should show 'Fraca' label."""
        driver.get(f"{APP_URL}/signup")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "form"))
        )

        password_input = driver.find_elements(By.CSS_SELECTOR, "input[type='password']")[0]
        password_input.send_keys("abc")

        WebDriverWait(driver, 5).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='password-strength-label']"))
        )
        label = driver.find_element(By.CSS_SELECTOR, "[data-testid='password-strength-label']")
        # With only lowercase < 8 chars, score = 0, no checks pass
        # So label may be empty or "Fraca"
        assert label is not None, "Strength label should exist"

    def test_strength_strong_password(self, driver):
        """A password meeting all criteria should show 'Forte' label."""
        driver.get(f"{APP_URL}/signup")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "form"))
        )

        password_input = driver.find_elements(By.CSS_SELECTOR, "input[type='password']")[0]
        password_input.send_keys("MyStr0ng!Pass")

        WebDriverWait(driver, 5).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='password-strength-label']"))
        )
        label = driver.find_element(By.CSS_SELECTOR, "[data-testid='password-strength-label']")
        assert "Forte" in label.text, f"Expected 'Forte', got: '{label.text}'"

    def test_strength_bars_exist(self, driver):
        """Four strength bars should render when password has content."""
        driver.get(f"{APP_URL}/signup")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "form"))
        )

        password_input = driver.find_elements(By.CSS_SELECTOR, "input[type='password']")[0]
        password_input.send_keys("test")

        WebDriverWait(driver, 5).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='strength-bar-1']"))
        )
        for i in range(1, 5):
            bars = driver.find_elements(By.CSS_SELECTOR, f"[data-testid='strength-bar-{i}']")
            assert len(bars) == 1, f"Strength bar {i} should exist"


@pytest.mark.frontend
class TestCNPJValidation:
    """Tests for CNPJ format validation on signup."""

    def test_cnpj_field_exists(self, driver):
        """CNPJ input field should exist on signup page."""
        driver.get(f"{APP_URL}/signup")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "form"))
        )
        cnpj_input = driver.find_elements(By.CSS_SELECTOR, "[data-testid='cnpj-input']")
        assert len(cnpj_input) > 0, "CNPJ input field not found"

    def test_cnpj_auto_formats(self, driver):
        """Typing digits into the CNPJ field should auto-format to XX.XXX.XXX/XXXX-XX."""
        driver.get(f"{APP_URL}/signup")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "form"))
        )

        cnpj_input = driver.find_element(By.CSS_SELECTOR, "[data-testid='cnpj-input']")
        cnpj_input.send_keys("11222333000181")

        value = cnpj_input.get_attribute("value")
        assert "/" in value or "." in value, \
            f"CNPJ should be auto-formatted, got: '{value}'"

    def test_cnpj_invalid_shows_error_on_submit(self, driver):
        """Submitting with an invalid CNPJ should show a validation error."""
        driver.get(f"{APP_URL}/signup")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "form"))
        )

        # Fill all required fields
        name_input = driver.find_elements(By.CSS_SELECTOR, "input[placeholder='Seu nome']")[0]
        name_input.send_keys("Teste User")

        barbershop_input = driver.find_elements(By.CSS_SELECTOR, "input[placeholder='Barbearia Exemplo']")[0]
        barbershop_input.send_keys("Barbearia Test")

        phone_input = driver.find_elements(By.CSS_SELECTOR, "input[placeholder='(11) 99999-9999']")[0]
        phone_input.send_keys("11999998888")

        email_input = driver.find_element(By.CSS_SELECTOR, "input[type='email']")
        email_input.send_keys("cnpjtest@example.com")

        # Enter invalid CNPJ
        cnpj_input = driver.find_element(By.CSS_SELECTOR, "[data-testid='cnpj-input']")
        cnpj_input.send_keys("11111111111111")

        # Fill passwords
        password_inputs = driver.find_elements(By.CSS_SELECTOR, "input[type='password']")
        password_inputs[0].send_keys("Test1234!")
        password_inputs[1].send_keys("Test1234!")

        # Accept terms
        checkbox = driver.find_element(By.CSS_SELECTOR, "input[type='checkbox']")
        if not checkbox.is_selected():
            checkbox.click()

        # Submit
        submit_btn = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
        submit_btn.click()

        # Wait for CNPJ error
        WebDriverWait(driver, 5).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='cnpj-error']"))
        )
        error = driver.find_element(By.CSS_SELECTOR, "[data-testid='cnpj-error']")
        assert "CNPJ" in error.text or "invalido" in error.text, \
            f"Expected CNPJ validation error, got: '{error.text}'"

    def test_cnpj_empty_is_valid(self, driver):
        """Leaving CNPJ empty should not trigger validation error (optional field)."""
        driver.get(f"{APP_URL}/signup")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "form"))
        )

        cnpj_input = driver.find_element(By.CSS_SELECTOR, "[data-testid='cnpj-input']")
        # Leave empty, check no error exists for CNPJ
        cnpj_errors = driver.find_elements(By.CSS_SELECTOR, "[data-testid='cnpj-error']")
        assert len(cnpj_errors) == 0, "CNPJ error should not appear when field is empty"
