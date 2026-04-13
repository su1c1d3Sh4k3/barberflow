"""Frontend tests for WhatsApp preview bubble in Definicoes page."""
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

APP_URL = "http://localhost:3000"


@pytest.mark.frontend
class TestWhatsAppPreviewBubble:
    """Tests for the WhatsApp-style message preview in Definicoes tabs."""

    def _login_and_navigate(self, driver):
        """Helper: navigate to definicoes page (assumes auth or public access)."""
        driver.get(f"{APP_URL}/definicoes")
        # Wait for page to load (either redirect to login or show content)
        WebDriverWait(driver, 10).until(
            lambda d: "definicoes" in d.current_url or "login" in d.current_url
        )

    def test_followup_tab_has_whatsapp_preview(self, driver):
        """Follow-up tab should contain a WhatsApp preview bubble element."""
        self._login_and_navigate(driver)
        if "login" in driver.current_url:
            pytest.skip("Requires authentication - skipping in CI")

        # Follow-up is the default tab
        previews = driver.find_elements(By.CSS_SELECTOR, "[data-testid='whatsapp-preview']")
        # At least one preview bubble should exist for follow-ups
        assert len(previews) > 0, "WhatsApp preview bubble not found in follow-up tab"

    def test_whatsapp_bubble_has_green_background(self, driver):
        """The WhatsApp bubble should have the characteristic green background (#DCF8C6)."""
        self._login_and_navigate(driver)
        if "login" in driver.current_url:
            pytest.skip("Requires authentication - skipping in CI")

        bubbles = driver.find_elements(By.CSS_SELECTOR, ".bg-\\[\\#DCF8C6\\]")
        assert len(bubbles) > 0, "Green WhatsApp bubble background not found"

    def test_whatsapp_bubble_has_tail_arrow(self, driver):
        """The WhatsApp bubble should have a tail arrow element."""
        self._login_and_navigate(driver)
        if "login" in driver.current_url:
            pytest.skip("Requires authentication - skipping in CI")

        tails = driver.find_elements(By.CSS_SELECTOR, "[data-testid='whatsapp-tail']")
        assert len(tails) > 0, "WhatsApp bubble tail arrow not found"

    def test_whatsapp_bubble_has_timestamp(self, driver):
        """The WhatsApp bubble should display a timestamp."""
        self._login_and_navigate(driver)
        if "login" in driver.current_url:
            pytest.skip("Requires authentication - skipping in CI")

        timestamps = driver.find_elements(By.CSS_SELECTOR, "[data-testid='whatsapp-timestamp']")
        assert len(timestamps) > 0, "WhatsApp timestamp not found in preview"

    def test_aniversario_tab_has_preview(self, driver):
        """Aniversario tab should also contain a WhatsApp preview bubble."""
        self._login_and_navigate(driver)
        if "login" in driver.current_url:
            pytest.skip("Requires authentication - skipping in CI")

        # Click aniversario tab
        aniv_buttons = driver.find_elements(By.XPATH,
            "//button[contains(text(), 'Anivers')]"
        )
        if aniv_buttons:
            aniv_buttons[0].click()
            WebDriverWait(driver, 5).until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, "[data-testid='whatsapp-preview'], .bg-\\[\\#DCF8C6\\]")
                )
            )
            # Verify preview exists
            previews = driver.find_elements(
                By.CSS_SELECTOR,
                "[data-testid='whatsapp-preview'], .bg-\\[\\#DCF8C6\\]"
            )
            assert len(previews) > 0, "WhatsApp preview not found in Aniversario tab"

    def test_boasvindas_tab_has_preview(self, driver):
        """Boas-vindas tab should also contain a WhatsApp preview bubble."""
        self._login_and_navigate(driver)
        if "login" in driver.current_url:
            pytest.skip("Requires authentication - skipping in CI")

        # Click boas-vindas tab
        bv_buttons = driver.find_elements(By.XPATH,
            "//button[contains(text(), 'Boas-vindas')]"
        )
        if bv_buttons:
            bv_buttons[0].click()
            WebDriverWait(driver, 5).until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, "[data-testid='whatsapp-preview'], .bg-\\[\\#DCF8C6\\]")
                )
            )
            previews = driver.find_elements(
                By.CSS_SELECTOR,
                "[data-testid='whatsapp-preview'], .bg-\\[\\#DCF8C6\\]"
            )
            assert len(previews) > 0, "WhatsApp preview not found in Boas-vindas tab"

    def test_variable_replacement_in_preview(self, driver):
        """Variables like $nome should be replaced with sample data in preview."""
        self._login_and_navigate(driver)
        if "login" in driver.current_url:
            pytest.skip("Requires authentication - skipping in CI")

        # Type a message with variable in a textarea
        textareas = driver.find_elements(By.CSS_SELECTOR, "textarea")
        if textareas:
            textareas[0].clear()
            textareas[0].send_keys("Ola $nome, bem-vindo a $barbearia!")

            # Check preview text
            WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='whatsapp-message-text']"))
            )
            preview_texts = driver.find_elements(By.CSS_SELECTOR, "[data-testid='whatsapp-message-text']")
            found_replacement = False
            for pt in preview_texts:
                text = pt.text
                if "Joao" in text and "Barbearia Teste" in text:
                    found_replacement = True
                    break
            assert found_replacement, \
                "Variables should be replaced with sample data (Joao, Barbearia Teste)"
