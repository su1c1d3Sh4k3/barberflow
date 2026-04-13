"""
BarberFlow Test Suite - Shared Configuration
"""
import os
import pytest
import requests
from dotenv import load_dotenv

# Load .env.local
env_path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
load_dotenv(env_path)

# ─── Constants ───
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "https://vpvsrqkptvphkivwqxoy.supabase.co")
SUPABASE_ANON_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
APP_URL = os.getenv("APP_URL", "http://localhost:3000")
UAZAPI_URL = os.getenv("UAZAPI_SERVER_URL", "")
UAZAPI_ADMIN_TOKEN = os.getenv("UAZAPI_ADMIN_TOKEN", "")


@pytest.fixture(scope="session")
def supabase_url():
    return SUPABASE_URL


@pytest.fixture(scope="session")
def service_key():
    return SUPABASE_SERVICE_KEY


@pytest.fixture(scope="session")
def anon_key():
    return SUPABASE_ANON_KEY


@pytest.fixture(scope="session")
def app_url():
    return APP_URL


@pytest.fixture(scope="session")
def api_headers():
    """Headers for internal API calls."""
    return {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="session")
def supabase_headers():
    """Headers for direct Supabase REST calls."""
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _cleanup_tenant(supabase_url, supabase_headers, tenant_id):
    """Delete all data for a tenant, respecting FK constraints.

    Some junction tables (professional_services, appointment_services,
    appointment_history) have no tenant_id column, so we must delete
    them via their FK references first.
    """
    h = {**supabase_headers, "Prefer": ""}
    h_repr = {**supabase_headers, "Prefer": "return=representation"}

    # 1. Collect IDs for FK-based deletes
    r = requests.get(
        f"{supabase_url}/rest/v1/professionals?tenant_id=eq.{tenant_id}&select=id",
        headers=h_repr,
    )
    prof_ids = [p["id"] for p in r.json()] if r.status_code == 200 and r.json() else []

    r = requests.get(
        f"{supabase_url}/rest/v1/services?tenant_id=eq.{tenant_id}&select=id",
        headers=h_repr,
    )
    svc_ids = [s["id"] for s in r.json()] if r.status_code == 200 and r.json() else []

    r = requests.get(
        f"{supabase_url}/rest/v1/appointments?tenant_id=eq.{tenant_id}&select=id",
        headers=h_repr,
    )
    appt_ids = [a["id"] for a in r.json()] if r.status_code == 200 and r.json() else []

    # 2. Delete junction tables by FK
    for sid in svc_ids:
        requests.delete(f"{supabase_url}/rest/v1/service_combos?parent_service_id=eq.{sid}", headers=h)
        requests.delete(f"{supabase_url}/rest/v1/service_combos?child_service_id=eq.{sid}", headers=h)
    for pid in prof_ids:
        requests.delete(f"{supabase_url}/rest/v1/professional_services?professional_id=eq.{pid}", headers=h)
    for aid in appt_ids:
        requests.delete(f"{supabase_url}/rest/v1/appointment_services?appointment_id=eq.{aid}", headers=h)
        requests.delete(f"{supabase_url}/rest/v1/appointment_history?appointment_id=eq.{aid}", headers=h)

    # 3. Also clean appointments referencing these professionals (from other tenants)
    for pid in prof_ids:
        r2 = requests.get(
            f"{supabase_url}/rest/v1/appointments?professional_id=eq.{pid}&select=id",
            headers=h_repr,
        )
        for a in (r2.json() if r2.status_code == 200 and r2.json() else []):
            requests.delete(f"{supabase_url}/rest/v1/appointment_services?appointment_id=eq.{a['id']}", headers=h)
            requests.delete(f"{supabase_url}/rest/v1/appointment_history?appointment_id=eq.{a['id']}", headers=h)
        requests.delete(f"{supabase_url}/rest/v1/appointments?professional_id=eq.{pid}", headers=h)

    # 4. Delete tenant-scoped tables (order matters for FK constraints)
    for table in [
        "appointments", "contacts", "professionals", "services",
        "service_categories", "conversation_states", "messages", "coupons",
        "followups", "ia_settings", "settings", "whatsapp_sessions",
        "waitlist", "subscriptions", "invoices", "token_usage_ledger",
        "audit_logs", "users", "promotions", "business_hours", "companies",
    ]:
        requests.delete(f"{supabase_url}/rest/v1/{table}?tenant_id=eq.{tenant_id}", headers=h)

    # 5. Delete tenant itself
    requests.delete(f"{supabase_url}/rest/v1/tenants?id=eq.{tenant_id}", headers=h)


@pytest.fixture(scope="session")
def test_tenant(supabase_headers, supabase_url):
    """Create a test tenant and return its id. Cleanup after session."""
    slug = "test-barberflow-e2e"

    # Check if leftover test tenant exists (from a previous crashed run)
    existing = requests.get(
        f"{supabase_url}/rest/v1/tenants?public_slug=eq.{slug}&select=id",
        headers=supabase_headers,
    )
    if existing.status_code == 200 and existing.json():
        old_id = existing.json()[0]["id"]
        _cleanup_tenant(supabase_url, supabase_headers, old_id)

    # Create tenant
    resp = requests.post(
        f"{supabase_url}/rest/v1/tenants",
        headers=supabase_headers,
        json={"name": "Test Barbearia", "plan": "trial", "public_slug": slug},
    )
    assert resp.status_code in (200, 201), f"Failed to create tenant: {resp.text}"
    tenant = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
    tenant_id = tenant["id"]

    # Create default company
    resp2 = requests.post(
        f"{supabase_url}/rest/v1/companies",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "Barbearia Teste", "is_default": True},
    )
    assert resp2.status_code in (200, 201), f"Failed to create company: {resp2.text}"
    company = resp2.json()[0] if isinstance(resp2.json(), list) else resp2.json()

    # Create settings
    requests.post(
        f"{supabase_url}/rest/v1/settings",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "welcome_message": "Olá! Bem-vindo!"},
    )

    yield {"tenant_id": tenant_id, "company_id": company["id"]}

    # Cleanup
    _cleanup_tenant(supabase_url, supabase_headers, tenant_id)
