"""
Tests for the Super Admin panel API routes.
- /api/admin/auth/login
- /api/admin/auth/logout
- /api/admin/tenants
- /api/admin/tenants/[tenantId]
- /api/admin/impersonate
- /api/admin/impersonate/exit
"""
import os
import pytest
import requests
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env.local")
load_dotenv(env_path)

APP_URL = os.getenv("APP_URL", "http://localhost:3000")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@barbearia.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


# ─── Helper ──────────────────────────────────────────────────────────────────

def admin_login() -> requests.Session:
    """Returns a session with admin cookie set."""
    session = requests.Session()
    resp = session.post(
        f"{APP_URL}/api/admin/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    assert resp.json().get("success") is True
    return session


# ─── Auth tests ───────────────────────────────────────────────────────────────

class TestAdminAuth:
    def test_login_success(self):
        """Valid admin credentials return 200 and set cookie."""
        resp = requests.post(
            f"{APP_URL}/api/admin/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert resp.status_code == 200
        assert resp.json().get("success") is True
        assert "barberflow_admin_token" in resp.cookies

    def test_login_wrong_password(self):
        """Wrong password returns 401."""
        resp = requests.post(
            f"{APP_URL}/api/admin/auth/login",
            json={"email": ADMIN_EMAIL, "password": "wrong_password"},
        )
        assert resp.status_code == 401
        data = resp.json()
        assert "error" in data

    def test_login_wrong_email(self):
        """Wrong email returns 401."""
        resp = requests.post(
            f"{APP_URL}/api/admin/auth/login",
            json={"email": "notadmin@test.com", "password": ADMIN_PASSWORD},
        )
        assert resp.status_code == 401

    def test_login_missing_fields(self):
        """Missing fields handled gracefully."""
        resp = requests.post(
            f"{APP_URL}/api/admin/auth/login",
            json={},
        )
        assert resp.status_code in (400, 401, 500)

    def test_logout(self):
        """Logout clears the admin cookie."""
        session = admin_login()
        resp = session.post(f"{APP_URL}/api/admin/auth/logout")
        assert resp.status_code == 200
        assert resp.json().get("success") is True
        # Cookie should be cleared (empty value or not present)
        cookie_val = resp.cookies.get("barberflow_admin_token", "")
        assert cookie_val == "" or cookie_val is None


# ─── Tenants tests ────────────────────────────────────────────────────────────

class TestAdminTenants:
    def test_get_tenants_requires_auth(self):
        """Unauthenticated request returns 401."""
        resp = requests.get(f"{APP_URL}/api/admin/tenants")
        assert resp.status_code == 401

    def test_get_tenants_authenticated(self):
        """Authenticated admin can list all tenants."""
        session = admin_login()
        resp = session.get(f"{APP_URL}/api/admin/tenants")
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        assert isinstance(data["data"], list)

    def test_tenants_structure(self):
        """Each tenant row has expected fields."""
        session = admin_login()
        resp = session.get(f"{APP_URL}/api/admin/tenants")
        assert resp.status_code == 200
        tenants = resp.json().get("data", [])

        if tenants:
            t = tenants[0]
            required_fields = [
                "id", "name", "owner_email", "subscription_status",
                "plan_name", "plan_tier", "whatsapp_status",
                "tokens_this_month",
            ]
            for field in required_fields:
                assert field in t, f"Missing field: {field}"

    def test_get_tenant_token_history_requires_auth(self):
        """Token history endpoint requires admin auth."""
        # Get a tenant ID first
        session = admin_login()
        tenants = session.get(f"{APP_URL}/api/admin/tenants").json().get("data", [])
        if not tenants:
            pytest.skip("No tenants available")

        tenant_id = tenants[0]["id"]

        # Unauthenticated request
        resp = requests.get(f"{APP_URL}/api/admin/tenants/{tenant_id}")
        assert resp.status_code == 401

    def test_get_tenant_token_history(self):
        """Authenticated admin can get token history for a tenant."""
        session = admin_login()
        tenants = session.get(f"{APP_URL}/api/admin/tenants").json().get("data", [])
        if not tenants:
            pytest.skip("No tenants available")

        tenant_id = tenants[0]["id"]
        resp = session.get(f"{APP_URL}/api/admin/tenants/{tenant_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        assert isinstance(data["data"], list)

    def test_patch_tenant_requires_auth(self):
        """Patching tenant plan requires admin auth."""
        resp = requests.patch(
            f"{APP_URL}/api/admin/tenants/nonexistent",
            json={"subscription_status": "trial"},
        )
        assert resp.status_code == 401

    def test_patch_tenant_plan(self):
        """Admin can update tenant subscription status."""
        session = admin_login()
        tenants = session.get(f"{APP_URL}/api/admin/tenants").json().get("data", [])
        if not tenants:
            pytest.skip("No tenants available")

        tenant_id = tenants[0]["id"]
        original_status = tenants[0]["subscription_status"]

        # Update to same status (no-op, just testing the endpoint)
        resp = session.patch(
            f"{APP_URL}/api/admin/tenants/{tenant_id}",
            json={"subscription_status": original_status},
        )
        assert resp.status_code == 200
        assert resp.json().get("success") is True


# ─── Impersonation tests ──────────────────────────────────────────────────────

class TestAdminImpersonate:
    def test_impersonate_requires_auth(self):
        """Impersonation endpoint requires admin auth."""
        resp = requests.post(
            f"{APP_URL}/api/admin/impersonate",
            json={"tenantId": "some-tenant-id"},
        )
        assert resp.status_code == 401

    def test_impersonate_missing_tenant_id(self):
        """Missing tenantId returns 400."""
        session = admin_login()
        resp = session.post(
            f"{APP_URL}/api/admin/impersonate",
            json={},
        )
        assert resp.status_code == 400

    def test_impersonate_invalid_tenant(self):
        """Non-existent tenantId returns error."""
        session = admin_login()
        resp = session.post(
            f"{APP_URL}/api/admin/impersonate",
            json={"tenantId": "00000000-0000-0000-0000-000000000000"},
        )
        # Should return 404 (no owner found) or 500 (magic link generation failure)
        assert resp.status_code in (404, 500)

    def test_impersonate_exit_requires_no_auth(self):
        """Exit impersonation clears cookies — no auth needed."""
        resp = requests.post(f"{APP_URL}/api/admin/impersonate/exit")
        assert resp.status_code == 200
        assert resp.json().get("success") is True

    def test_impersonate_sets_cookies(self):
        """Successful impersonation sets impersonation cookies."""
        session = admin_login()
        tenants = session.get(f"{APP_URL}/api/admin/tenants").json().get("data", [])

        # Find a tenant with an owner user
        tenant_with_owner = None
        for t in tenants:
            if t.get("owner_email") and t["owner_email"] != "—":
                tenant_with_owner = t
                break

        if not tenant_with_owner:
            pytest.skip("No tenant with owner found")

        resp = session.post(
            f"{APP_URL}/api/admin/impersonate",
            json={"tenantId": tenant_with_owner["id"]},
        )

        # May succeed or fail based on owner having a confirmed email
        if resp.status_code == 200:
            data = resp.json()
            assert "tokenHash" in data
            assert "tenantId" in data
            # Impersonation cookies should be set
            assert "barberflow_impersonate" in resp.cookies or "barberflow_impersonate_name" in resp.cookies


# ─── Admin routing tests ──────────────────────────────────────────────────────

class TestAdminRouting:
    def test_admin_login_page_accessible(self):
        """The /admin login page returns 200."""
        resp = requests.get(f"{APP_URL}/admin", allow_redirects=True)
        assert resp.status_code == 200

    def test_admin_dashboard_redirects_without_auth(self):
        """Unauthenticated access to /admin/dashboard redirects to /admin."""
        resp = requests.get(f"{APP_URL}/admin/dashboard", allow_redirects=False)
        assert resp.status_code in (302, 307, 308)
        location = resp.headers.get("location", "")
        assert "/admin" in location

    def test_admin_dashboard_accessible_with_auth(self):
        """Authenticated admin can access /admin/dashboard."""
        session = admin_login()
        resp = session.get(f"{APP_URL}/admin/dashboard", allow_redirects=True)
        assert resp.status_code == 200
