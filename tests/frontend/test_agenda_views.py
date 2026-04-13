"""Selenium tests for the Agenda page views (Day, Week, Month, List).

NOTE: These tests require an authenticated session to access /agenda.
They are skipped in CI environments where auth is not configured.
"""
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

APP_URL = "http://localhost:3000"


@pytest.mark.frontend
@pytest.mark.skip(reason="Agenda page requires authenticated session - run manually with auth")
class TestAgendaViews:
    """Verify the 4 agenda views render correctly and toggle works."""

    @pytest.fixture(autouse=True)
    def setup(self, driver):
        self.driver = driver
        self.wait = WebDriverWait(driver, 15)
        driver.get(f"{APP_URL}/agenda")

    def _click_view_button(self, mode: str):
        """Click a view toggle button by its data-testid."""
        btn = self.wait.until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, f'[data-testid="view-btn-{mode}"]'))
        )
        btn.click()

    def test_all_four_view_buttons_render(self):
        """All 4 view toggle buttons (Dia, Semana, Mes, Lista) should be present."""
        toggle = self.wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '[data-testid="view-toggle"]'))
        )
        buttons = toggle.find_elements(By.CSS_SELECTOR, "button")
        assert len(buttons) == 4, f"Expected 4 view buttons, found {len(buttons)}"

        # Check each specific button exists
        for mode in ["day", "week", "month", "list"]:
            btn = self.driver.find_element(By.CSS_SELECTOR, f'[data-testid="view-btn-{mode}"]')
            assert btn is not None, f"View button for '{mode}' not found"
            assert btn.is_displayed(), f"View button for '{mode}' is not visible"

    def test_day_view_renders_by_default(self):
        """Day view should be visible by default."""
        day_view = self.wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '[data-testid="day-view"]'))
        )
        assert day_view.is_displayed(), "Day view should be visible by default"

    def test_week_view_renders_7_columns(self):
        """Week view should display 7 day columns."""
        self._click_view_button("week")
        week_view = self.wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '[data-testid="week-view"]'))
        )
        assert week_view.is_displayed(), "Week view should be visible"

        columns = week_view.find_elements(By.CSS_SELECTOR, '[data-testid="week-day-column"]')
        assert len(columns) == 7, f"Expected 7 day columns in week view, found {len(columns)}"

    def test_month_view_renders_calendar_grid(self):
        """Month view should display a calendar grid with day cells."""
        self._click_view_button("month")
        month_view = self.wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '[data-testid="month-view"]'))
        )
        assert month_view.is_displayed(), "Month view should be visible"

        grid = self.driver.find_element(By.CSS_SELECTOR, '[data-testid="month-grid"]')
        cells = grid.find_elements(By.CSS_SELECTOR, '[data-testid="month-day-cell"]')
        # A month grid should have at least 28 cells (4 weeks) and at most 42 (6 weeks)
        assert 28 <= len(cells) <= 42, f"Expected 28-42 day cells, found {len(cells)}"

    def test_list_view_renders_table(self):
        """List view should display a table with header columns."""
        self._click_view_button("list")
        list_view = self.wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '[data-testid="list-view"]'))
        )
        assert list_view.is_displayed(), "List view should be visible"

        # Check table header columns exist
        headers = list_view.find_elements(By.CSS_SELECTOR, "span")
        header_texts = [h.text.lower() for h in headers]
        for expected in ["horário", "cliente", "serviço", "profissional", "status"]:
            assert any(
                expected in t for t in header_texts
            ), f"List view header should contain '{expected}'"

    def test_view_toggle_switches_between_views(self):
        """Clicking different view buttons should switch the visible view."""
        # Start with day view
        self.wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '[data-testid="day-view"]'))
        )

        # Switch to week
        self._click_view_button("week")
        self.wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '[data-testid="week-view"]'))
        )
        assert len(self.driver.find_elements(By.CSS_SELECTOR, '[data-testid="day-view"]')) == 0, \
            "Day view should be hidden when week view is active"

        # Switch to month
        self._click_view_button("month")
        self.wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '[data-testid="month-view"]'))
        )
        assert len(self.driver.find_elements(By.CSS_SELECTOR, '[data-testid="week-view"]')) == 0, \
            "Week view should be hidden when month view is active"

        # Switch to list
        self._click_view_button("list")
        self.wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '[data-testid="list-view"]'))
        )
        assert len(self.driver.find_elements(By.CSS_SELECTOR, '[data-testid="month-view"]')) == 0, \
            "Month view should be hidden when list view is active"

        # Back to day
        self._click_view_button("day")
        self.wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '[data-testid="day-view"]'))
        )
        assert len(self.driver.find_elements(By.CSS_SELECTOR, '[data-testid="list-view"]')) == 0, \
            "List view should be hidden when day view is active"

    def test_list_view_rows_are_rendered(self):
        """If there are appointments, list view should render list-row elements."""
        self._click_view_button("list")
        self.wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '[data-testid="list-view"]'))
        )
        # This test just verifies the structure renders - rows depend on data
        list_view = self.driver.find_element(By.CSS_SELECTOR, '[data-testid="list-view"]')
        # Either we see rows or the empty state message
        rows = list_view.find_elements(By.CSS_SELECTOR, '[data-testid="list-row"]')
        empty_msg = list_view.find_elements(By.XPATH, ".//*[contains(text(), 'Nenhum agendamento')]")
        assert len(rows) > 0 or len(empty_msg) > 0, \
            "List view should show either appointment rows or empty state message"
