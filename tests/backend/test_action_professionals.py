"""
Tests for professional server action logic: CRUD, service links, schedules, soft-delete.
"""
import requests
import uuid


def _create_service(supabase_url, supabase_headers, tenant_id, name="Corte Teste"):
    """Helper: create a service category + service, return both IDs."""
    cat_resp = requests.post(
        f"{supabase_url}/rest/v1/service_categories",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": f"Cat-{uuid.uuid4().hex[:6]}"},
    )
    cat = cat_resp.json()[0] if isinstance(cat_resp.json(), list) else cat_resp.json()

    svc_resp = requests.post(
        f"{supabase_url}/rest/v1/services",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "category_id": cat["id"],
            "name": name,
            "price": 50.00,
            "duration_min": 30,
        },
    )
    svc = svc_resp.json()[0] if isinstance(svc_resp.json(), list) else svc_resp.json()
    return {"category_id": cat["id"], "service_id": svc["id"]}


def _cleanup_professional(supabase_url, supabase_headers, pro_id, svc_ids=None, cat_ids=None):
    """Helper: clean up a professional and its related data."""
    h = {**supabase_headers, "Prefer": ""}
    requests.delete(f"{supabase_url}/rest/v1/professional_services?professional_id=eq.{pro_id}", headers=h)
    requests.delete(f"{supabase_url}/rest/v1/professional_schedules?professional_id=eq.{pro_id}", headers=h)
    requests.delete(f"{supabase_url}/rest/v1/professionals?id=eq.{pro_id}", headers=h)
    for sid in (svc_ids or []):
        requests.delete(f"{supabase_url}/rest/v1/services?id=eq.{sid}", headers=h)
    for cid in (cat_ids or []):
        requests.delete(f"{supabase_url}/rest/v1/service_categories?id=eq.{cid}", headers=h)


class TestProfessionalActions:
    """Test professional operations matching src/lib/actions/professionals.ts."""

    def test_create_professional_all_fields(self, supabase_url, supabase_headers, test_tenant):
        """Create a professional with all fields populated."""
        tenant_id = test_tenant["tenant_id"]
        company_id = test_tenant["company_id"]

        resp = requests.post(
            f"{supabase_url}/rest/v1/professionals",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "company_id": company_id,
                "name": "Carlos Action Pro",
                "phone": "11988001122",
                "email": "carlos@action.test",
                "bio": "Especialista em cortes modernos",
                "commission_pct": 40,
                "active": True,
            },
        )
        assert resp.status_code in (200, 201), f"Failed: {resp.text}"
        pro = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
        assert pro["name"] == "Carlos Action Pro"
        assert pro["phone"] == "11988001122"
        assert pro["email"] == "carlos@action.test"
        assert pro["bio"] == "Especialista em cortes modernos"
        assert pro["commission_pct"] == 40
        assert pro["active"] is True
        assert pro["tenant_id"] == tenant_id

        _cleanup_professional(supabase_url, supabase_headers, pro["id"])

    def test_link_services_to_professional(self, supabase_url, supabase_headers, test_tenant):
        """Link services to a professional via professional_services junction."""
        tenant_id = test_tenant["tenant_id"]

        # Create professional
        resp = requests.post(
            f"{supabase_url}/rest/v1/professionals",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "name": "Link Svc Pro", "active": True},
        )
        assert resp.status_code in (200, 201)
        pro = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

        # Create two services
        svc1 = _create_service(supabase_url, supabase_headers, tenant_id, "Corte Link 1")
        svc2 = _create_service(supabase_url, supabase_headers, tenant_id, "Barba Link 2")

        # Link both services
        links = [
            {"professional_id": pro["id"], "service_id": svc1["service_id"]},
            {"professional_id": pro["id"], "service_id": svc2["service_id"]},
        ]
        link_resp = requests.post(
            f"{supabase_url}/rest/v1/professional_services",
            headers=supabase_headers,
            json=links,
        )
        assert link_resp.status_code in (200, 201), f"Link failed: {link_resp.text}"

        # Verify links exist
        check = requests.get(
            f"{supabase_url}/rest/v1/professional_services?professional_id=eq.{pro['id']}&select=*",
            headers=supabase_headers,
        )
        assert check.status_code == 200
        assert len(check.json()) == 2

        _cleanup_professional(
            supabase_url, supabase_headers, pro["id"],
            svc_ids=[svc1["service_id"], svc2["service_id"]],
            cat_ids=[svc1["category_id"], svc2["category_id"]],
        )

    def test_create_schedule(self, supabase_url, supabase_headers, test_tenant):
        """Create schedule entries via professional_schedules."""
        tenant_id = test_tenant["tenant_id"]

        resp = requests.post(
            f"{supabase_url}/rest/v1/professionals",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "name": "Schedule Action Pro", "active": True},
        )
        assert resp.status_code in (200, 201)
        pro = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

        # Create schedules for Mon, Tue, Wed
        schedules = [
            {
                "professional_id": pro["id"],
                "weekday": day,
                "start_time": "08:00",
                "end_time": "17:00",
                "break_start": "12:00",
                "break_end": "13:00",
            }
            for day in [1, 2, 3]
        ]
        sched_resp = requests.post(
            f"{supabase_url}/rest/v1/professional_schedules",
            headers=supabase_headers,
            json=schedules,
        )
        assert sched_resp.status_code in (200, 201), f"Failed: {sched_resp.text}"
        data = sched_resp.json()
        assert len(data) == 3
        assert data[0]["start_time"] == "08:00:00"
        assert data[0]["break_start"] == "12:00:00"

        _cleanup_professional(supabase_url, supabase_headers, pro["id"])

    def test_update_professional(self, supabase_url, supabase_headers, test_tenant):
        """Update professional fields."""
        tenant_id = test_tenant["tenant_id"]

        resp = requests.post(
            f"{supabase_url}/rest/v1/professionals",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "name": "Update Action Pro", "active": True},
        )
        assert resp.status_code in (200, 201)
        pro = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

        # Update
        patch_resp = requests.patch(
            f"{supabase_url}/rest/v1/professionals?id=eq.{pro['id']}",
            headers=supabase_headers,
            json={
                "name": "Updated Action Pro",
                "bio": "Nova bio atualizada",
                "commission_pct": 50,
            },
        )
        assert patch_resp.status_code == 200
        updated = patch_resp.json()[0]
        assert updated["name"] == "Updated Action Pro"
        assert updated["bio"] == "Nova bio atualizada"
        assert updated["commission_pct"] == 50

        _cleanup_professional(supabase_url, supabase_headers, pro["id"])

    def test_soft_delete_professional(self, supabase_url, supabase_headers, test_tenant):
        """Soft-delete sets active=false but record remains in DB."""
        tenant_id = test_tenant["tenant_id"]

        resp = requests.post(
            f"{supabase_url}/rest/v1/professionals",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "name": "SoftDel Pro", "active": True},
        )
        assert resp.status_code in (200, 201)
        pro = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
        pro_id = pro["id"]

        # Soft delete (set active=false)
        patch_resp = requests.patch(
            f"{supabase_url}/rest/v1/professionals?id=eq.{pro_id}",
            headers=supabase_headers,
            json={"active": False},
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()[0]["active"] is False

        # Verify still in DB
        check = requests.get(
            f"{supabase_url}/rest/v1/professionals?id=eq.{pro_id}&select=id,active",
            headers=supabase_headers,
        )
        assert check.status_code == 200
        assert len(check.json()) == 1
        assert check.json()[0]["active"] is False

        _cleanup_professional(supabase_url, supabase_headers, pro_id)

    def test_get_professionals_only_active(self, supabase_url, supabase_headers, test_tenant):
        """getProfessionals filters by tenant and active=true only."""
        tenant_id = test_tenant["tenant_id"]

        # Create one active and one inactive professional
        resp1 = requests.post(
            f"{supabase_url}/rest/v1/professionals",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "name": "Active Filter Pro", "active": True},
        )
        assert resp1.status_code in (200, 201)
        active_pro = resp1.json()[0] if isinstance(resp1.json(), list) else resp1.json()

        resp2 = requests.post(
            f"{supabase_url}/rest/v1/professionals",
            headers=supabase_headers,
            json={"tenant_id": tenant_id, "name": "Inactive Filter Pro", "active": False},
        )
        assert resp2.status_code in (200, 201)
        inactive_pro = resp2.json()[0] if isinstance(resp2.json(), list) else resp2.json()

        try:
            # Query like getProfessionals: tenant + active=true + order by name
            resp = requests.get(
                f"{supabase_url}/rest/v1/professionals"
                f"?tenant_id=eq.{tenant_id}&active=eq.true&select=*&order=name",
                headers=supabase_headers,
            )
            assert resp.status_code == 200
            pros = resp.json()
            pro_names = [p["name"] for p in pros]
            assert "Active Filter Pro" in pro_names
            assert "Inactive Filter Pro" not in pro_names
        finally:
            _cleanup_professional(supabase_url, supabase_headers, active_pro["id"])
            _cleanup_professional(supabase_url, supabase_headers, inactive_pro["id"])
