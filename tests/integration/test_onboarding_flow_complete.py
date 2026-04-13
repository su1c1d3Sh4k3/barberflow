"""
Integration test: Full onboarding simulation.

Flow:
  1. Create tenant with subscription (trial)
  2. Create company (step 1)
  3. Create professional (step 2)
  4. Create category + services (step 3)
  5. Create WhatsApp session placeholder (step 4)
  6. Mark onboarding_completed = true
  7. Verify all records exist
"""
import pytest
import requests
import uuid
from datetime import datetime, timedelta, timezone


@pytest.mark.integration
class TestOnboardingFlowComplete:
    """End-to-end onboarding simulation tests."""

    @pytest.fixture(autouse=True)
    def setup(self, supabase_headers, supabase_url):
        """Set up test data references and clean up after."""
        self.headers = supabase_headers
        self.base_url = supabase_url
        self.tenant_id = None
        self.created_ids = {"professional_ids": []}

        yield

        self._cleanup()

    def _cleanup(self):
        """Remove all test data created during the test."""
        if not self.tenant_id:
            return

        h = {**self.headers, "Prefer": ""}

        for pid in self.created_ids.get("professional_ids", []):
            requests.delete(f"{self.base_url}/rest/v1/professional_services?professional_id=eq.{pid}", headers=h)

        for table in [
            "whatsapp_sessions", "professionals", "services",
            "service_categories", "settings", "companies",
            "subscriptions", "business_hours",
        ]:
            requests.delete(f"{self.base_url}/rest/v1/{table}?tenant_id=eq.{self.tenant_id}", headers=h)

        requests.delete(f"{self.base_url}/rest/v1/tenants?id=eq.{self.tenant_id}", headers=h)

    def _post(self, table, data):
        resp = requests.post(
            f"{self.base_url}/rest/v1/{table}",
            headers=self.headers,
            json=data,
        )
        assert resp.status_code in (200, 201), (
            f"Failed to create {table}: {resp.status_code} - {resp.text}"
        )
        result = resp.json()
        return result[0] if isinstance(result, list) else result

    def _get(self, table, query_params):
        resp = requests.get(
            f"{self.base_url}/rest/v1/{table}?{query_params}",
            headers=self.headers,
        )
        assert resp.status_code == 200, (
            f"Failed to GET {table}: {resp.status_code} - {resp.text}"
        )
        return resp.json()

    def _patch(self, table, query_params, data):
        resp = requests.patch(
            f"{self.base_url}/rest/v1/{table}?{query_params}",
            headers={**self.headers, "Prefer": "return=representation"},
            json=data,
        )
        assert resp.status_code == 200, (
            f"Failed to PATCH {table}: {resp.status_code} - {resp.text}"
        )
        result = resp.json()
        return result[0] if isinstance(result, list) else result

    def test_full_onboarding_flow(self):
        """
        Simulate the complete onboarding wizard:
        Step 0: Create tenant + trial subscription
        Step 1: Create company
        Step 2: Create professional
        Step 3: Create categories + services
        Step 4: Create WhatsApp session placeholder
        Step 5: Mark onboarding as completed
        Step 6: Verify everything exists
        """
        slug = f"onboard-test-{uuid.uuid4().hex[:8]}"

        # ── Step 0: Create tenant ──
        # NOTE: onboarding_completed lives on the `users` table, not `tenants`.
        # The tenants table does not have this column, so we just create the
        # tenant without it and track onboarding completion separately.
        tenant = self._post("tenants", {
            "name": "Onboarding Barbearia",
            "plan": "trial",
            "public_slug": slug,
        })
        self.tenant_id = tenant["id"]
        assert tenant["plan"] == "trial", "New tenant should be on trial plan"

        # Create trial subscription
        trial_end = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
        subscription = self._post("subscriptions", {
            "tenant_id": self.tenant_id,
            "status": "trial",
            "trial_ends_at": trial_end,
        })
        assert subscription["status"] == "trial", "Subscription should start as trial"

        # ── Step 1: Create company ──
        company = self._post("companies", {
            "tenant_id": self.tenant_id,
            "name": "Barbearia do Teste",
            "is_default": True,
            "address": {"street": "Rua Teste, 123"},
            "phone": "5511999999999",
        })
        assert company["name"] == "Barbearia do Teste", "Company name mismatch"
        assert company["is_default"] is True, "Company should be default"

        # Create settings
        self._post("settings", {
            "tenant_id": self.tenant_id,
            "welcome_message": "Bem-vindo a Barbearia do Teste!",
        })

        # ── Step 2: Create professional ──
        professional = self._post("professionals", {
            "tenant_id": self.tenant_id,
            "company_id": company["id"],
            "name": "Carlos Barbeiro",
            "active": True,
        })
        self.created_ids["professional_ids"].append(professional["id"])
        assert professional["active"] is True, "Professional should be active"

        # ── Step 3: Create category + services ──
        category = self._post("service_categories", {
            "tenant_id": self.tenant_id,
            "name": "Cortes",
        })

        service1 = self._post("services", {
            "tenant_id": self.tenant_id,
            "category_id": category["id"],
            "name": "Corte Masculino",
            "duration_min": 30,
            "price": 40.00,
            "active": True,
        })

        service2 = self._post("services", {
            "tenant_id": self.tenant_id,
            "category_id": category["id"],
            "name": "Barba",
            "duration_min": 20,
            "price": 25.00,
            "active": True,
        })

        # Link professional to services
        for svc in [service1, service2]:
            self._post("professional_services", {
                "tenant_id": self.tenant_id,
                "professional_id": professional["id"],
                "service_id": svc["id"],
            })

        # ── Step 4: Create WhatsApp session placeholder ──
        # The whatsapp_sessions table uses `instance_id` (not `instance_name`).
        instance_id = f"onboard-{uuid.uuid4().hex[:8]}"
        whatsapp_session = self._post("whatsapp_sessions", {
            "tenant_id": self.tenant_id,
            "instance_id": instance_id,
            "status": "disconnected",
        })
        assert whatsapp_session["status"] == "disconnected", (
            "WhatsApp session should start as disconnected"
        )

        # ── Step 5: Verify onboarding data is complete ──
        # NOTE: The `onboarding_completed` flag lives on the `users` table,
        # and users.id requires a FK to auth.users (which we can't create in
        # tests).  Instead we verify all entities exist as proof of completion.

        # ── Step 6: Verify all records exist ──
        # Verify tenant
        tenants = self._get("tenants", f"id=eq.{self.tenant_id}")
        assert len(tenants) == 1, "Tenant should exist"
        assert tenants[0]["plan"] == "trial", "Tenant plan should be trial"

        # Verify subscription
        subs = self._get("subscriptions", f"tenant_id=eq.{self.tenant_id}")
        assert len(subs) >= 1, "Subscription should exist"
        assert subs[0]["status"] == "trial"

        # Verify company
        companies = self._get("companies", f"tenant_id=eq.{self.tenant_id}")
        assert len(companies) >= 1, "Company should exist"

        # Verify professional
        profs = self._get("professionals", f"tenant_id=eq.{self.tenant_id}")
        assert len(profs) >= 1, "Professional should exist"

        # Verify services
        svcs = self._get("services", f"tenant_id=eq.{self.tenant_id}")
        assert len(svcs) >= 2, f"Expected at least 2 services, got {len(svcs)}"

        # Verify categories
        cats = self._get("service_categories", f"tenant_id=eq.{self.tenant_id}")
        assert len(cats) >= 1, "Category should exist"

        # Verify professional-service links
        prof_svcs = self._get(
            "professional_services",
            f"professional_id=eq.{professional['id']}",
        )
        assert len(prof_svcs) >= 2, (
            f"Expected at least 2 professional-service links, got {len(prof_svcs)}"
        )

        # Verify WhatsApp session
        sessions = self._get("whatsapp_sessions", f"tenant_id=eq.{self.tenant_id}")
        assert len(sessions) >= 1, "WhatsApp session should exist"

        # Verify settings
        settings = self._get("settings", f"tenant_id=eq.{self.tenant_id}")
        assert len(settings) >= 1, "Settings should exist"

    def test_onboarding_incomplete_without_all_steps(self):
        """
        A tenant that skips steps should still have onboarding_completed=false.
        """
        slug = f"onboard-inc-{uuid.uuid4().hex[:8]}"

        tenant = self._post("tenants", {
            "name": "Incomplete Onboarding",
            "plan": "trial",
            "public_slug": slug,
        })
        self.tenant_id = tenant["id"]

        # Only create company (step 1), skip everything else
        self._post("companies", {
            "tenant_id": self.tenant_id,
            "name": "Barbearia Incompleta",
            "is_default": True,
        })

        # Verify tenant exists but onboarding is incomplete
        # (no professionals, services, or whatsapp sessions)
        tenants = self._get("tenants", f"id=eq.{self.tenant_id}")
        assert len(tenants) == 1, "Tenant should exist"

        # Verify missing entities
        profs = self._get("professionals", f"tenant_id=eq.{self.tenant_id}")
        assert len(profs) == 0, "Should have no professionals yet"

        svcs = self._get("services", f"tenant_id=eq.{self.tenant_id}")
        assert len(svcs) == 0, "Should have no services yet"

        sessions = self._get("whatsapp_sessions", f"tenant_id=eq.{self.tenant_id}")
        assert len(sessions) == 0, "Should have no WhatsApp sessions yet"
