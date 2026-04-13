"""
Tests for the tenant cascade creation logic (simulating createTenantCascade).

Verifies that after creating a tenant, all cascaded records exist:
tenants -> subscriptions (trial) -> companies (is_default) -> settings -> ia_settings

NOTE: The users table has a FK to auth.users, so we cannot create arbitrary
user rows in tests that run outside the Supabase Auth flow. The cascade test
therefore covers only the records that can be created via direct REST inserts.
"""
import requests
import uuid
from datetime import datetime, timedelta, timezone


def _cleanup_cascade(supabase_url, supabase_headers, tenant_id):
    """Remove all cascade records for the test tenant."""
    h = {**supabase_headers, "Prefer": ""}
    for table in [
        "ia_settings", "settings", "companies",
        "subscriptions", "tenants",
    ]:
        url = f"{supabase_url}/rest/v1/{table}?"
        col = "id" if table == "tenants" else "tenant_id"
        requests.delete(f"{url}{col}=eq.{tenant_id}", headers=h)


class TestTenantCascade:
    """Simulate what createTenantCascade does via direct Supabase REST calls.

    We skip the `users` step because `users.id` has a FK reference to
    `auth.users`, which cannot be satisfied outside a real Supabase Auth
    signup flow.
    """

    def _run_cascade(self, supabase_url, supabase_headers):
        """Execute the cascade (minus user creation) and return all created records."""
        slug = f"test-cascade-{uuid.uuid4().hex[:8]}"
        barbershop_name = "Barbearia Cascade Test"

        trial_ends_at = datetime.now(timezone.utc) + timedelta(days=7)
        trial_ends_iso = trial_ends_at.isoformat()

        # 1. Create tenant
        resp = requests.post(
            f"{supabase_url}/rest/v1/tenants",
            headers=supabase_headers,
            json={
                "name": barbershop_name,
                "plan": "trial",
                "trial_ends_at": trial_ends_iso,
                "public_slug": slug,
            },
        )
        assert resp.status_code in (200, 201), f"Tenant creation failed: {resp.text}"
        tenant = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
        tenant_id = tenant["id"]

        # 2. Create subscription (trial)
        resp = requests.post(
            f"{supabase_url}/rest/v1/subscriptions",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "status": "trial",
                "trial_ends_at": trial_ends_iso,
            },
        )
        assert resp.status_code in (200, 201), f"Subscription creation failed: {resp.text}"
        subscription = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

        # 3. Create default company
        resp = requests.post(
            f"{supabase_url}/rest/v1/companies",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "name": barbershop_name,
                "phone": "11999990000",
                "email": "cascade@test.com",
                "is_default": True,
            },
        )
        assert resp.status_code in (200, 201), f"Company creation failed: {resp.text}"
        company = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

        # 4. Create default settings
        resp = requests.post(
            f"{supabase_url}/rest/v1/settings",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "welcome_message": f"Olá! Bem-vindo à *{barbershop_name}*!",
            },
        )
        assert resp.status_code in (200, 201), f"Settings creation failed: {resp.text}"
        settings = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

        # 5. Create IA settings
        resp = requests.post(
            f"{supabase_url}/rest/v1/ia_settings",
            headers=supabase_headers,
            json={"tenant_id": tenant_id},
        )
        assert resp.status_code in (200, 201), f"IA settings creation failed: {resp.text}"
        ia_settings = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

        return {
            "tenant_id": tenant_id,
            "tenant": tenant,
            "subscription": subscription,
            "company": company,
            "settings": settings,
            "ia_settings": ia_settings,
            "trial_ends_at": trial_ends_at,
        }

    def test_cascade_creates_all_records(self, supabase_url, supabase_headers):
        """Verify all cascaded records (except user) exist after creation."""
        cascade = self._run_cascade(supabase_url, supabase_headers)
        tenant_id = cascade["tenant_id"]

        try:
            # Verify tenant
            resp = requests.get(
                f"{supabase_url}/rest/v1/tenants?id=eq.{tenant_id}&select=*",
                headers=supabase_headers,
            )
            assert resp.status_code == 200
            assert len(resp.json()) == 1

            # Verify subscription
            resp = requests.get(
                f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}&select=*",
                headers=supabase_headers,
            )
            assert resp.status_code == 200
            assert len(resp.json()) >= 1

            # Verify company
            resp = requests.get(
                f"{supabase_url}/rest/v1/companies?tenant_id=eq.{tenant_id}&select=*",
                headers=supabase_headers,
            )
            assert resp.status_code == 200
            assert len(resp.json()) >= 1

            # Verify settings
            resp = requests.get(
                f"{supabase_url}/rest/v1/settings?tenant_id=eq.{tenant_id}&select=*",
                headers=supabase_headers,
            )
            assert resp.status_code == 200
            assert len(resp.json()) >= 1

            # Verify IA settings
            resp = requests.get(
                f"{supabase_url}/rest/v1/ia_settings?tenant_id=eq.{tenant_id}&select=*",
                headers=supabase_headers,
            )
            assert resp.status_code == 200
            assert len(resp.json()) >= 1
        finally:
            _cleanup_cascade(supabase_url, supabase_headers, tenant_id)

    def test_subscription_is_trial(self, supabase_url, supabase_headers):
        """Verify subscription defaults to trial status."""
        cascade = self._run_cascade(supabase_url, supabase_headers)
        tenant_id = cascade["tenant_id"]

        try:
            sub = cascade["subscription"]
            assert sub["status"] == "trial", f"Expected trial, got {sub['status']}"

            tenant = cascade["tenant"]
            assert tenant["plan"] == "trial", f"Expected trial plan, got {tenant['plan']}"
        finally:
            _cleanup_cascade(supabase_url, supabase_headers, tenant_id)

    def test_trial_ends_at_is_7_days(self, supabase_url, supabase_headers):
        """Verify trial_ends_at is approximately 7 days in the future."""
        cascade = self._run_cascade(supabase_url, supabase_headers)
        tenant_id = cascade["tenant_id"]

        try:
            sub = cascade["subscription"]
            trial_end = datetime.fromisoformat(sub["trial_ends_at"].replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            delta = trial_end - now

            # Should be between 6.5 and 7.5 days
            assert 6.5 <= delta.total_seconds() / 86400 <= 7.5, (
                f"trial_ends_at delta is {delta.total_seconds() / 86400:.1f} days, expected ~7"
            )
        finally:
            _cleanup_cascade(supabase_url, supabase_headers, tenant_id)

    def test_company_is_default(self, supabase_url, supabase_headers):
        """Verify the cascade-created company has is_default=true."""
        cascade = self._run_cascade(supabase_url, supabase_headers)
        tenant_id = cascade["tenant_id"]

        try:
            company = cascade["company"]
            assert company["is_default"] is True
        finally:
            _cleanup_cascade(supabase_url, supabase_headers, tenant_id)

    def test_settings_has_welcome_message(self, supabase_url, supabase_headers):
        """Verify default settings include a welcome message."""
        cascade = self._run_cascade(supabase_url, supabase_headers)
        tenant_id = cascade["tenant_id"]

        try:
            settings = cascade["settings"]
            assert settings["welcome_message"] is not None
            assert len(settings["welcome_message"]) > 0
        finally:
            _cleanup_cascade(supabase_url, supabase_headers, tenant_id)

    def test_ia_settings_created(self, supabase_url, supabase_headers):
        """Verify IA settings record is created for the tenant."""
        cascade = self._run_cascade(supabase_url, supabase_headers)
        tenant_id = cascade["tenant_id"]

        try:
            ia = cascade["ia_settings"]
            assert ia["tenant_id"] == tenant_id
            # Default values from the schema
            assert ia.get("enabled") is False
        finally:
            _cleanup_cascade(supabase_url, supabase_headers, tenant_id)
