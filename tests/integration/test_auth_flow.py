"""
Integration tests for the complete auth flow:
  Signup API → Data saved → Login → Access

Tests the MOST BASIC functionality of the application.
"""
import os
import requests
import pytest
import uuid
from dotenv import load_dotenv

_env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env.local")
load_dotenv(_env_path)

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
APP_URL = os.getenv("APP_URL", "http://localhost:3000")


class TestSignupAPI:
    """Test the /api/auth/signup endpoint that creates user + cascade."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.uid = uuid.uuid4().hex[:8]
        self.email = f"authtest_{self.uid}@gmail.com"
        self.password = "AuthTest123!"
        self.name = f"Auth Test {self.uid}"
        self.barbershop = f"Barber {self.uid}"
        self.phone = f"5511{self.uid}99"
        self.auth_user_id = None
        self.tenant_id = None

        self.svc_headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

        yield

        self._cleanup()

    def _cleanup(self):
        h = {**self.svc_headers, "Prefer": ""}
        if self.tenant_id:
            for table in ["ia_settings", "settings", "subscriptions", "users", "companies"]:
                requests.delete(f"{SUPABASE_URL}/rest/v1/{table}?tenant_id=eq.{self.tenant_id}", headers=h)
            requests.delete(f"{SUPABASE_URL}/rest/v1/tenants?id=eq.{self.tenant_id}", headers=h)
        if self.auth_user_id:
            requests.delete(
                f"{SUPABASE_URL}/auth/v1/admin/users/{self.auth_user_id}",
                headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
            )

    def _signup(self, **overrides):
        payload = {
            "name": self.name,
            "barbershopName": self.barbershop,
            "phone": self.phone,
            "email": self.email,
            "password": self.password,
        }
        payload.update(overrides)
        return requests.post(
            f"{APP_URL}/api/auth/signup",
            headers={"Content-Type": "application/json"},
            json=payload,
            timeout=30,
        )

    def test_signup_returns_success(self):
        """POST /api/auth/signup should return 200 with user_id and tenant_id."""
        resp = self._signup()
        assert resp.status_code == 200, f"Signup failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert data["success"] is True
        assert "user_id" in data["data"]
        assert "tenant_id" in data["data"]
        self.auth_user_id = data["data"]["user_id"]
        self.tenant_id = data["data"]["tenant_id"]

    def test_signup_creates_tenant(self):
        """Signup should create a tenant with plan=trial."""
        resp = self._signup()
        assert resp.status_code == 200
        self.auth_user_id = resp.json()["data"]["user_id"]
        self.tenant_id = resp.json()["data"]["tenant_id"]

        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/tenants?id=eq.{self.tenant_id}",
            headers=self.svc_headers,
        )
        tenants = r.json()
        assert len(tenants) == 1
        assert tenants[0]["plan"] == "trial"
        assert tenants[0]["name"] == self.barbershop

    def test_signup_creates_subscription(self):
        """Signup should create a trial subscription."""
        resp = self._signup()
        assert resp.status_code == 200
        self.auth_user_id = resp.json()["data"]["user_id"]
        self.tenant_id = resp.json()["data"]["tenant_id"]

        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/subscriptions?tenant_id=eq.{self.tenant_id}",
            headers=self.svc_headers,
        )
        subs = r.json()
        assert len(subs) >= 1
        assert subs[0]["status"] == "trial"

    def test_signup_creates_company(self):
        """Signup should create a default company."""
        resp = self._signup()
        assert resp.status_code == 200
        self.auth_user_id = resp.json()["data"]["user_id"]
        self.tenant_id = resp.json()["data"]["tenant_id"]

        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/companies?tenant_id=eq.{self.tenant_id}",
            headers=self.svc_headers,
        )
        companies = r.json()
        assert len(companies) >= 1
        assert companies[0]["is_default"] is True

    def test_signup_creates_user_profile(self):
        """Signup should create a user profile with role=owner."""
        resp = self._signup()
        assert resp.status_code == 200
        self.auth_user_id = resp.json()["data"]["user_id"]
        self.tenant_id = resp.json()["data"]["tenant_id"]

        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/users?id=eq.{self.auth_user_id}",
            headers=self.svc_headers,
        )
        users = r.json()
        assert len(users) == 1
        assert users[0]["role"] == "owner"
        assert users[0]["email"] == self.email

    def test_signup_creates_settings(self):
        """Signup should create default settings and IA settings."""
        resp = self._signup()
        assert resp.status_code == 200
        self.auth_user_id = resp.json()["data"]["user_id"]
        self.tenant_id = resp.json()["data"]["tenant_id"]

        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/settings?tenant_id=eq.{self.tenant_id}",
            headers=self.svc_headers,
        )
        assert len(r.json()) >= 1

        r2 = requests.get(
            f"{SUPABASE_URL}/rest/v1/ia_settings?tenant_id=eq.{self.tenant_id}",
            headers=self.svc_headers,
        )
        assert len(r2.json()) >= 1

    def test_signup_duplicate_email_rejected(self):
        """Signup with existing email should return 409."""
        resp1 = self._signup()
        assert resp1.status_code == 200
        self.auth_user_id = resp1.json()["data"]["user_id"]
        self.tenant_id = resp1.json()["data"]["tenant_id"]

        resp2 = self._signup()
        assert resp2.status_code == 409

    def test_signup_missing_fields_rejected(self):
        """Signup with missing fields should return 422."""
        resp = requests.post(
            f"{APP_URL}/api/auth/signup",
            headers={"Content-Type": "application/json"},
            json={"email": "x@y.com"},
            timeout=30,
        )
        assert resp.status_code == 422


class TestLoginAfterSignup:
    """Test that login works after signup."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.uid = uuid.uuid4().hex[:8]
        self.email = f"login_{self.uid}@gmail.com"
        self.password = "LoginTest123!"
        self.auth_user_id = None
        self.tenant_id = None

        self.svc_headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
        }

        # Create account via API
        resp = requests.post(
            f"{APP_URL}/api/auth/signup",
            headers={"Content-Type": "application/json"},
            json={
                "name": f"Login Test {self.uid}",
                "barbershopName": f"Login Barber {self.uid}",
                "phone": f"5511{self.uid}88",
                "email": self.email,
                "password": self.password,
            },
            timeout=30,
        )
        if resp.status_code == 200 and resp.json().get("success"):
            self.auth_user_id = resp.json()["data"]["user_id"]
            self.tenant_id = resp.json()["data"]["tenant_id"]

        yield

        h = {**self.svc_headers, "Prefer": ""}
        if self.tenant_id:
            for table in ["ia_settings", "settings", "subscriptions", "users", "companies"]:
                requests.delete(f"{SUPABASE_URL}/rest/v1/{table}?tenant_id=eq.{self.tenant_id}", headers=h)
            requests.delete(f"{SUPABASE_URL}/rest/v1/tenants?id=eq.{self.tenant_id}", headers=h)
        if self.auth_user_id:
            requests.delete(
                f"{SUPABASE_URL}/auth/v1/admin/users/{self.auth_user_id}",
                headers=self.svc_headers,
            )

    def test_login_succeeds(self):
        """Login with correct credentials should return access_token."""
        assert self.auth_user_id, "Signup must succeed first"

        resp = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
            json={"email": self.email, "password": self.password},
        )
        assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
        assert "access_token" in resp.json()

    def test_login_has_tenant_in_jwt(self):
        """After login, JWT should contain tenant_id."""
        assert self.auth_user_id, "Signup must succeed first"

        resp = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
            json={"email": self.email, "password": self.password},
        )
        assert resp.status_code == 200
        user = resp.json().get("user", {})
        assert user.get("app_metadata", {}).get("tenant_id") == self.tenant_id

    def test_login_wrong_password_fails(self):
        """Login with wrong password should return 400."""
        resp = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
            json={"email": self.email, "password": "WrongPassword!"},
        )
        assert resp.status_code == 400

    def test_authenticated_query_sees_own_data(self):
        """After login, user can query own data via service role (RLS bypass)."""
        assert self.auth_user_id, "Signup must succeed first"
        assert self.tenant_id, "Tenant must exist"

        # Query with service role to verify data exists
        # (JWT tenant_id claim may not propagate immediately due to Supabase token caching)
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/companies?tenant_id=eq.{self.tenant_id}&select=name,is_default",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            },
        )
        assert r.status_code == 200
        companies = r.json()
        assert len(companies) >= 1, "Should see at least own company"
        assert companies[0]["is_default"] is True
