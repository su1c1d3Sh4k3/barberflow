"""
Tests for professionals table: CRUD, schedules, services link, tenant isolation.
"""
import requests
import uuid


def _create_professional(supabase_url, supabase_headers, tenant_id, **kwargs):
    """Helper to create a professional."""
    payload = {
        "tenant_id": tenant_id,
        "name": kwargs.get("name", "João Barbeiro"),
        "phone": kwargs.get("phone", "11999001122"),
        "email": kwargs.get("email", "joao@test.com"),
        "active": kwargs.get("active", True),
    }
    resp = requests.post(
        f"{supabase_url}/rest/v1/professionals",
        headers=supabase_headers,
        json=payload,
    )
    return resp


def test_create_professional(supabase_url, supabase_headers, test_tenant):
    """Insert a professional with all fields."""
    tenant_id = test_tenant["tenant_id"]
    resp = _create_professional(supabase_url, supabase_headers, tenant_id)
    assert resp.status_code in (200, 201), f"Failed: {resp.text}"
    pro = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
    assert pro["name"] == "João Barbeiro"
    assert pro["tenant_id"] == tenant_id
    assert pro["active"] is True

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/professionals?id=eq.{pro['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_professional_services_link(supabase_url, supabase_headers, test_tenant):
    """Create N:N link between professional and services."""
    tenant_id = test_tenant["tenant_id"]

    # Create professional
    resp = _create_professional(supabase_url, supabase_headers, tenant_id, name="Link Test Pro")
    assert resp.status_code in (200, 201)
    pro = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

    # Create service category
    cat_resp = requests.post(
        f"{supabase_url}/rest/v1/service_categories",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "Cortes"},
    )
    assert cat_resp.status_code in (200, 201)
    cat = cat_resp.json()[0] if isinstance(cat_resp.json(), list) else cat_resp.json()

    # Create service
    svc_resp = requests.post(
        f"{supabase_url}/rest/v1/services",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "category_id": cat["id"],
            "name": "Corte Simples",
            "price": 45.00,
            "duration_min": 30,
        },
    )
    assert svc_resp.status_code in (200, 201)
    svc = svc_resp.json()[0] if isinstance(svc_resp.json(), list) else svc_resp.json()

    # Create link
    link_resp = requests.post(
        f"{supabase_url}/rest/v1/professional_services",
        headers=supabase_headers,
        json={"professional_id": pro["id"], "service_id": svc["id"]},
    )
    assert link_resp.status_code in (200, 201), f"Failed link: {link_resp.text}"

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/professional_services?professional_id=eq.{pro['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
    requests.delete(
        f"{supabase_url}/rest/v1/services?id=eq.{svc['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
    requests.delete(
        f"{supabase_url}/rest/v1/service_categories?id=eq.{cat['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
    requests.delete(
        f"{supabase_url}/rest/v1/professionals?id=eq.{pro['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_professional_schedule(supabase_url, supabase_headers, test_tenant):
    """Create schedule entries for a professional."""
    tenant_id = test_tenant["tenant_id"]

    resp = _create_professional(supabase_url, supabase_headers, tenant_id, name="Schedule Pro")
    assert resp.status_code in (200, 201)
    pro = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

    # Create schedule for Monday (1) and Tuesday (2)
    schedules = [
        {
            "professional_id": pro["id"],
            "weekday": 1,
            "start_time": "09:00",
            "end_time": "18:00",
        },
        {
            "professional_id": pro["id"],
            "weekday": 2,
            "start_time": "09:00",
            "end_time": "18:00",
        },
    ]
    sched_resp = requests.post(
        f"{supabase_url}/rest/v1/professional_schedules",
        headers=supabase_headers,
        json=schedules,
    )
    assert sched_resp.status_code in (200, 201), f"Failed: {sched_resp.text}"
    data = sched_resp.json()
    assert len(data) == 2

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/professional_schedules?professional_id=eq.{pro['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
    requests.delete(
        f"{supabase_url}/rest/v1/professionals?id=eq.{pro['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_deactivate_professional(supabase_url, supabase_headers, test_tenant):
    """Set active=false on a professional."""
    tenant_id = test_tenant["tenant_id"]

    resp = _create_professional(supabase_url, supabase_headers, tenant_id, name="Deactivate Pro")
    assert resp.status_code in (200, 201)
    pro = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

    patch_resp = requests.patch(
        f"{supabase_url}/rest/v1/professionals?id=eq.{pro['id']}",
        headers=supabase_headers,
        json={"active": False},
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()[0]
    assert updated["active"] is False

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/professionals?id=eq.{pro['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_professional_belongs_to_tenant(supabase_url, supabase_headers, test_tenant):
    """Verify professional cannot be created with a non-existent tenant_id."""
    fake_tenant_id = str(uuid.uuid4())
    resp = _create_professional(
        supabase_url, supabase_headers, fake_tenant_id, name="Orphan Pro"
    )
    assert resp.status_code in (400, 409), f"Expected FK error, got {resp.status_code}: {resp.text}"
