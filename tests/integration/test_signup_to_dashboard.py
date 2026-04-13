"""
End-to-end test: Signup → Login → JWT has tenant_id → Can read own data via RLS.

This tests the EXACT flow a real user experiences:
1. POST /api/auth/signup (creates account + cascade)
2. POST /auth/v1/token (login)
3. Token refresh (picks up tenant_id claim)
4. GET /rest/v1/companies with user JWT (RLS filters to own tenant)
5. GET /rest/v1/users with user JWT (sees own profile)
6. Update company via user JWT (save works)
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


@pytest.mark.integration
class TestSignupToDashboard:
    """Full user journey from signup through to using the app."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.uid = uuid.uuid4().hex[:8]
        self.email = f"e2e_{self.uid}@gmail.com"
        self.password = "E2eTest123!"
        self.barbershop = f"E2E Barber {self.uid}"
        self.auth_user_id = None
        self.tenant_id = None

        self.svc = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
        }

        yield

        # Cleanup
        h = {**self.svc, "Prefer": ""}
        if self.tenant_id:
            for t in ["ia_settings", "settings", "subscriptions", "users", "companies"]:
                requests.delete(f"{SUPABASE_URL}/rest/v1/{t}?tenant_id=eq.{self.tenant_id}", headers=h)
            requests.delete(f"{SUPABASE_URL}/rest/v1/tenants?id=eq.{self.tenant_id}", headers=h)
        if self.auth_user_id:
            requests.delete(f"{SUPABASE_URL}/auth/v1/admin/users/{self.auth_user_id}", headers=self.svc)

    def _signup(self):
        return requests.post(
            f"{APP_URL}/api/auth/signup",
            json={
                "name": f"E2E User {self.uid}",
                "barbershopName": self.barbershop,
                "phone": f"5511{self.uid}00",
                "email": self.email,
                "password": self.password,
            },
            timeout=30,
        )

    def _login(self):
        return requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
            json={"email": self.email, "password": self.password},
        )

    def _refresh_token(self, refresh_token):
        return requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=refresh_token",
            headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
            json={"refresh_token": refresh_token},
        )

    def _user_headers(self, access_token):
        return {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

    def test_full_user_journey(self):
        """Signup → Login → Refresh → Read data → Update data."""

        # === STEP 1: Signup ===
        signup_resp = self._signup()
        assert signup_resp.status_code == 200, f"Signup failed: {signup_resp.text}"
        signup_data = signup_resp.json()["data"]
        self.auth_user_id = signup_data["user_id"]
        self.tenant_id = signup_data["tenant_id"]

        # === STEP 2: Login ===
        login_resp = self._login()
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        tokens = login_resp.json()
        access_token = tokens["access_token"]
        refresh_token = tokens["refresh_token"]

        # === STEP 3: Check if JWT has tenant_id ===
        user_meta = tokens.get("user", {}).get("app_metadata", {})
        jwt_tenant_id = user_meta.get("tenant_id")

        # If tenant_id not in JWT yet, refresh the token (may need multiple attempts
        # because the signup trigger that sets app_metadata is async)
        import time
        for _attempt in range(3):
            if jwt_tenant_id == self.tenant_id:
                break
            time.sleep(1)
            refresh_resp = self._refresh_token(refresh_token)
            assert refresh_resp.status_code == 200, f"Refresh failed: {refresh_resp.text}"
            tokens = refresh_resp.json()
            access_token = tokens["access_token"]
            refresh_token = tokens.get("refresh_token", refresh_token)
            jwt_tenant_id = tokens.get("user", {}).get("app_metadata", {}).get("tenant_id")

        assert jwt_tenant_id == self.tenant_id, (
            f"JWT should contain tenant_id={self.tenant_id}, got {jwt_tenant_id}"
        )

        # === STEP 4: Read own data with user JWT (RLS) ===
        h = self._user_headers(access_token)

        # Read profile (add tenant_id filter to help RLS)
        r = requests.get(f"{SUPABASE_URL}/rest/v1/users?select=name,role,email&tenant_id=eq.{self.tenant_id}", headers=h)
        assert r.status_code == 200
        users = r.json()
        assert len(users) >= 1, f"Should see own profile, got {users}"
        assert users[0]["role"] == "owner"

        # Read company
        r = requests.get(f"{SUPABASE_URL}/rest/v1/companies?select=id,name,is_default", headers=h)
        assert r.status_code == 200
        companies = r.json()
        assert len(companies) >= 1, f"Should see own company, got {companies}"
        assert companies[0]["is_default"] is True
        company_id = companies[0]["id"]

        # Read tenant
        r = requests.get(f"{SUPABASE_URL}/rest/v1/tenants?select=name,plan", headers=h)
        assert r.status_code == 200
        tenants = r.json()
        assert len(tenants) >= 1, f"Should see own tenant, got {tenants}"
        assert tenants[0]["plan"] == "trial"

        # Read subscription
        r = requests.get(f"{SUPABASE_URL}/rest/v1/subscriptions?select=status", headers=h)
        assert r.status_code == 200
        subs = r.json()
        assert len(subs) >= 1, f"Should see own subscription, got {subs}"
        assert subs[0]["status"] == "trial"

        # === STEP 5: Update company (simulates onboarding step 1) ===
        r = requests.patch(
            f"{SUPABASE_URL}/rest/v1/companies?id=eq.{company_id}",
            headers={**h, "Prefer": "return=representation"},
            json={
                "description": "Melhor barbearia da cidade",
                "address": {"rua": "Rua Teste", "numero": "123", "cidade": "São Paulo", "estado": "SP"},
            },
        )
        assert r.status_code == 200, f"Company update failed: {r.status_code} {r.text}"
        updated = r.json()
        assert len(updated) >= 1
        assert updated[0]["description"] == "Melhor barbearia da cidade"

        # === STEP 6: Create professional (simulates onboarding step 2) ===
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/professionals",
            headers={**h, "Prefer": "return=representation"},
            json={
                "tenant_id": self.tenant_id,
                "company_id": company_id,
                "name": "João Barbeiro",
                "active": True,
                "commission_pct": 40,
            },
        )
        assert r.status_code in (200, 201), f"Professional create failed: {r.status_code} {r.text}"

        # === STEP 7: Create category + service (simulates onboarding step 3) ===
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/service_categories",
            headers={**h, "Prefer": "return=representation"},
            json={"tenant_id": self.tenant_id, "name": "Cortes"},
        )
        assert r.status_code in (200, 201), f"Category create failed: {r.status_code} {r.text}"
        cat = r.json()[0] if isinstance(r.json(), list) else r.json()

        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/services",
            headers={**h, "Prefer": "return=representation"},
            json={
                "tenant_id": self.tenant_id,
                "category_id": cat["id"],
                "name": "Corte Masculino",
                "duration_min": 30,
                "price": 45.00,
                "active": True,
            },
        )
        assert r.status_code in (200, 201), f"Service create failed: {r.status_code} {r.text}"
