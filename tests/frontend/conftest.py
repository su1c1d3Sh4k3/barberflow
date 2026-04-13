import pytest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

APP_URL = "http://localhost:3000"


@pytest.fixture(scope="module")
def driver():
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1440,900")
    d = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    d.implicitly_wait(10)
    yield d
    d.quit()
