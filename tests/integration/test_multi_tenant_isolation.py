"""
Integration test: Multi-tenant data isolation.

Verifies that data from one tenant is not visible to another:
  1. Create 2 test tenants (tenant_a, tenant_b)
  2. Create contacts in tenant_a
  3. Create contacts in tenant_b
  4. Query contacts for tenant_a -> should NOT see tenant_b's contacts
  5. Query appointments for tenant_b -> should NOT see tenant_a's data
  6. Cleanup both tenants
"""
import pytest
import requests
import uuid
from datetime import datetime, timedelta


@pytest.mark.integration
class TestMultiTenantIsolation:
    """Tests verifying strict data isolation between tenants."""

    @pytest.fixture(autouse=True)
    def setup(self, supabase_headers, supabase_url):
        """Set up test data references and clean up after."""
        self.headers = supabase_headers
        self.base_url = supabase_url
        self.tenant_ids = []
        self.created_ids = {"appointment_ids": [], "professional_ids": []}

        yield

        self._cleanup()

    def _cleanup(self):
        """Remove all test data for both tenants."""
        h = {**self.headers, "Prefer": ""}

        for aid in self.created_ids.get("appointment_ids", []):
            requests.delete(f"{self.base_url}/rest/v1/appointment_services?appointment_id=eq.{aid}", headers=h)
            requests.delete(f"{self.base_url}/rest/v1/appointment_history?appointment_id=eq.{aid}", headers=h)

        for pid in self.created_ids.get("professional_ids", []):
            requests.delete(f"{self.base_url}/rest/v1/professional_services?professional_id=eq.{pid}", headers=h)

        for tenant_id in self.tenant_ids:
            for table in [
                "appointments", "contacts", "professionals", "services",
                "service_categories", "settings", "companies",
                "subscriptions", "whatsapp_sessions", "coupons",
            ]:
                requests.delete(
                    f"{self.base_url}/rest/v1/{table}?tenant_id=eq.{tenant_id}",
                    headers=h,
                )
            requests.delete(f"{self.base_url}/rest/v1/tenants?id=eq.{tenant_id}", headers=h)

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

    def _create_tenant(self, name_suffix):
        """Create a tenant with company and return its id."""
        slug = f"iso-{name_suffix}-{uuid.uuid4().hex[:8]}"

        tenant = self._post("tenants", {
            "name": f"Isolation Test {name_suffix}",
            "plan": "trial",
            "public_slug": slug,
        })
        self.tenant_ids.append(tenant["id"])

        company = self._post("companies", {
            "tenant_id": tenant["id"],
            "name": f"Barbearia {name_suffix}",
            "is_default": True,
        })

        return {"tenant_id": tenant["id"], "company_id": company["id"]}

    def test_contacts_isolated_between_tenants(self):
        """Contacts from tenant_a should not appear in tenant_b queries."""
        tenant_a = self._create_tenant("alpha")
        tenant_b = self._create_tenant("bravo")

        # Create contacts in tenant_a
        contact_a1 = self._post("contacts", {
            "tenant_id": tenant_a["tenant_id"],
            "name": "Alpha Contact 1",
            "phone": f"55119{uuid.uuid4().hex[:8]}",
        })
        contact_a2 = self._post("contacts", {
            "tenant_id": tenant_a["tenant_id"],
            "name": "Alpha Contact 2",
            "phone": f"55119{uuid.uuid4().hex[:8]}",
        })

        # Create contacts in tenant_b
        contact_b1 = self._post("contacts", {
            "tenant_id": tenant_b["tenant_id"],
            "name": "Bravo Contact 1",
            "phone": f"55119{uuid.uuid4().hex[:8]}",
        })

        # Query tenant_a contacts
        a_contacts = self._get("contacts", f"tenant_id=eq.{tenant_a['tenant_id']}")
        a_contact_ids = {c["id"] for c in a_contacts}

        assert contact_a1["id"] in a_contact_ids, "Alpha Contact 1 should be in tenant_a results"
        assert contact_a2["id"] in a_contact_ids, "Alpha Contact 2 should be in tenant_a results"
        assert contact_b1["id"] not in a_contact_ids, (
            "Bravo Contact 1 should NOT appear in tenant_a results"
        )

        # Query tenant_b contacts
        b_contacts = self._get("contacts", f"tenant_id=eq.{tenant_b['tenant_id']}")
        b_contact_ids = {c["id"] for c in b_contacts}

        assert contact_b1["id"] in b_contact_ids, "Bravo Contact 1 should be in tenant_b results"
        assert contact_a1["id"] not in b_contact_ids, (
            "Alpha Contact 1 should NOT appear in tenant_b results"
        )
        assert contact_a2["id"] not in b_contact_ids, (
            "Alpha Contact 2 should NOT appear in tenant_b results"
        )

    def test_appointments_isolated_between_tenants(self):
        """Appointments from tenant_a should not appear in tenant_b queries."""
        tenant_a = self._create_tenant("appt-alpha")
        tenant_b = self._create_tenant("appt-bravo")

        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

        # Create full setup for tenant_a
        prof_a = self._post("professionals", {
            "tenant_id": tenant_a["tenant_id"],
            "company_id": tenant_a["company_id"],
            "name": "Prof Alpha",
            "active": True,
        })
        self.created_ids["professional_ids"].append(prof_a["id"])

        contact_a = self._post("contacts", {
            "tenant_id": tenant_a["tenant_id"],
            "name": "Contact Alpha",
            "phone": f"55119{uuid.uuid4().hex[:8]}",
        })

        appt_a = self._post("appointments", {
            "tenant_id": tenant_a["tenant_id"],
            "company_id": tenant_a["company_id"],
            "professional_id": prof_a["id"],
            "contact_id": contact_a["id"],
            "start_at": f"{tomorrow}T09:00:00",
            "end_at": f"{tomorrow}T09:30:00",
            "status": "pendente",
        })
        self.created_ids["appointment_ids"].append(appt_a["id"])

        # Create full setup for tenant_b
        prof_b = self._post("professionals", {
            "tenant_id": tenant_b["tenant_id"],
            "company_id": tenant_b["company_id"],
            "name": "Prof Bravo",
            "active": True,
        })
        self.created_ids["professional_ids"].append(prof_b["id"])

        contact_b = self._post("contacts", {
            "tenant_id": tenant_b["tenant_id"],
            "name": "Contact Bravo",
            "phone": f"55119{uuid.uuid4().hex[:8]}",
        })

        appt_b = self._post("appointments", {
            "tenant_id": tenant_b["tenant_id"],
            "company_id": tenant_b["company_id"],
            "professional_id": prof_b["id"],
            "contact_id": contact_b["id"],
            "start_at": f"{tomorrow}T10:00:00",
            "end_at": f"{tomorrow}T10:30:00",
            "status": "confirmado",
        })
        self.created_ids["appointment_ids"].append(appt_b["id"])

        # Query appointments for tenant_a
        a_appts = self._get("appointments", f"tenant_id=eq.{tenant_a['tenant_id']}")
        a_appt_ids = {a["id"] for a in a_appts}

        assert appt_a["id"] in a_appt_ids, "Appointment A should be in tenant_a results"
        assert appt_b["id"] not in a_appt_ids, (
            "Appointment B should NOT appear in tenant_a results"
        )

        # Query appointments for tenant_b
        b_appts = self._get("appointments", f"tenant_id=eq.{tenant_b['tenant_id']}")
        b_appt_ids = {a["id"] for a in b_appts}

        assert appt_b["id"] in b_appt_ids, "Appointment B should be in tenant_b results"
        assert appt_a["id"] not in b_appt_ids, (
            "Appointment A should NOT appear in tenant_b results"
        )

    def test_services_isolated_between_tenants(self):
        """Services from one tenant should not leak to another."""
        tenant_a = self._create_tenant("svc-alpha")
        tenant_b = self._create_tenant("svc-bravo")

        # Create services in tenant_a
        cat_a = self._post("service_categories", {
            "tenant_id": tenant_a["tenant_id"],
            "name": "Alpha Category",
        })
        svc_a = self._post("services", {
            "tenant_id": tenant_a["tenant_id"],
            "category_id": cat_a["id"],
            "name": "Alpha Corte",
            "duration_min": 30,
            "price": 50.00,
            "active": True,
        })

        # Create services in tenant_b
        cat_b = self._post("service_categories", {
            "tenant_id": tenant_b["tenant_id"],
            "name": "Bravo Category",
        })
        svc_b = self._post("services", {
            "tenant_id": tenant_b["tenant_id"],
            "category_id": cat_b["id"],
            "name": "Bravo Corte",
            "duration_min": 45,
            "price": 70.00,
            "active": True,
        })

        # Verify isolation
        a_services = self._get("services", f"tenant_id=eq.{tenant_a['tenant_id']}")
        a_svc_ids = {s["id"] for s in a_services}
        assert svc_a["id"] in a_svc_ids, "Alpha service should be in tenant_a"
        assert svc_b["id"] not in a_svc_ids, "Bravo service should NOT be in tenant_a"

        b_services = self._get("services", f"tenant_id=eq.{tenant_b['tenant_id']}")
        b_svc_ids = {s["id"] for s in b_services}
        assert svc_b["id"] in b_svc_ids, "Bravo service should be in tenant_b"
        assert svc_a["id"] not in b_svc_ids, "Alpha service should NOT be in tenant_b"

    def test_professionals_isolated_between_tenants(self):
        """Professionals from one tenant should not leak to another."""
        tenant_a = self._create_tenant("prof-alpha")
        tenant_b = self._create_tenant("prof-bravo")

        prof_a = self._post("professionals", {
            "tenant_id": tenant_a["tenant_id"],
            "company_id": tenant_a["company_id"],
            "name": "Alpha Barbeiro",
            "active": True,
        })
        self.created_ids["professional_ids"].append(prof_a["id"])

        prof_b = self._post("professionals", {
            "tenant_id": tenant_b["tenant_id"],
            "company_id": tenant_b["company_id"],
            "name": "Bravo Barbeiro",
            "active": True,
        })
        self.created_ids["professional_ids"].append(prof_b["id"])

        # Verify isolation
        a_profs = self._get("professionals", f"tenant_id=eq.{tenant_a['tenant_id']}")
        a_prof_ids = {p["id"] for p in a_profs}
        assert prof_a["id"] in a_prof_ids, "Alpha prof should be in tenant_a"
        assert prof_b["id"] not in a_prof_ids, "Bravo prof should NOT be in tenant_a"

        b_profs = self._get("professionals", f"tenant_id=eq.{tenant_b['tenant_id']}")
        b_prof_ids = {p["id"] for p in b_profs}
        assert prof_b["id"] in b_prof_ids, "Bravo prof should be in tenant_b"
        assert prof_a["id"] not in b_prof_ids, "Alpha prof should NOT be in tenant_b"

    def test_coupons_isolated_between_tenants(self):
        """Coupons from one tenant should not be accessible by another."""
        tenant_a = self._create_tenant("cpn-alpha")
        tenant_b = self._create_tenant("cpn-bravo")

        coupon_a = self._post("coupons", {
            "tenant_id": tenant_a["tenant_id"],
            "code": f"ALPHA{uuid.uuid4().hex[:6].upper()}",
            "discount_type": "percentage",
            "discount_value": 10.0,
            "max_uses": 5,
            "current_uses": 0,
            "active": True,
            "expires_at": (datetime.now() + timedelta(days=30)).isoformat(),
        })

        coupon_b = self._post("coupons", {
            "tenant_id": tenant_b["tenant_id"],
            "code": f"BRAVO{uuid.uuid4().hex[:6].upper()}",
            "discount_type": "fixed",
            "discount_value": 20.0,
            "max_uses": 3,
            "current_uses": 0,
            "active": True,
            "expires_at": (datetime.now() + timedelta(days=30)).isoformat(),
        })

        # Verify isolation
        a_coupons = self._get("coupons", f"tenant_id=eq.{tenant_a['tenant_id']}")
        a_coupon_ids = {c["id"] for c in a_coupons}
        assert coupon_a["id"] in a_coupon_ids, "Alpha coupon should be in tenant_a"
        assert coupon_b["id"] not in a_coupon_ids, "Bravo coupon should NOT be in tenant_a"

        b_coupons = self._get("coupons", f"tenant_id=eq.{tenant_b['tenant_id']}")
        b_coupon_ids = {c["id"] for c in b_coupons}
        assert coupon_b["id"] in b_coupon_ids, "Bravo coupon should be in tenant_b"
        assert coupon_a["id"] not in b_coupon_ids, "Alpha coupon should NOT be in tenant_b"
