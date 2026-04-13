"""
Backend tests that simulate the onboarding data creation flow.
"""
import requests
import uuid


def test_update_company_address(supabase_url, supabase_headers, test_tenant):
    """Update company with address jsonb field."""
    company_id = test_tenant["company_id"]
    resp = requests.patch(
        f"{supabase_url}/rest/v1/companies?id=eq.{company_id}",
        headers=supabase_headers,
        json={"address": {"cep": "01310-000", "rua": "Av Paulista", "numero": "1000", "cidade": "São Paulo", "estado": "SP"}},
    )
    assert resp.status_code in (200, 204), f"Failed to update address: {resp.text}"

    # Verify the address was saved
    get_resp = requests.get(
        f"{supabase_url}/rest/v1/companies?id=eq.{company_id}&select=address",
        headers=supabase_headers,
    )
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert len(data) == 1
    assert data[0]["address"]["cep"] == "01310-000"
    assert data[0]["address"]["cidade"] == "São Paulo"


def test_create_first_professional(supabase_url, supabase_headers, test_tenant):
    """Insert a professional with default schedule during onboarding."""
    tenant_id = test_tenant["tenant_id"]

    # Create professional
    resp = requests.post(
        f"{supabase_url}/rest/v1/professionals",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "company_id": test_tenant["company_id"],
            "name": "Barbeiro Onboarding",
            "phone": f"5511{uuid.uuid4().hex[:8]}",
            "active": True,
        },
    )
    assert resp.status_code in (200, 201), f"Failed to create professional: {resp.text}"
    professional = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
    prof_id = professional["id"]

    # Create default schedule (Mon-Fri 09:00-18:00)
    schedules = []
    for day in range(1, 6):  # Monday to Friday
        schedules.append({
            "professional_id": prof_id,
            "weekday": day,
            "start_time": "09:00",
            "end_time": "18:00",
        })

    sched_resp = requests.post(
        f"{supabase_url}/rest/v1/professional_schedules",
        headers=supabase_headers,
        json=schedules,
    )
    assert sched_resp.status_code in (200, 201), f"Failed to create schedules: {sched_resp.text}"
    sched_data = sched_resp.json()
    assert len(sched_data) == 5

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/professional_schedules?professional_id=eq.{prof_id}",
        headers={**supabase_headers, "Prefer": ""},
    )
    requests.delete(
        f"{supabase_url}/rest/v1/professionals?id=eq.{prof_id}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_create_first_category_and_services(supabase_url, supabase_headers, test_tenant):
    """Insert a category and 2 services during onboarding."""
    tenant_id = test_tenant["tenant_id"]

    # Create category
    cat_resp = requests.post(
        f"{supabase_url}/rest/v1/service_categories",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "Cortes", "description": "Serviços de corte"},
    )
    assert cat_resp.status_code in (200, 201), f"Failed to create category: {cat_resp.text}"
    category = cat_resp.json()[0] if isinstance(cat_resp.json(), list) else cat_resp.json()
    cat_id = category["id"]

    # Verify category exists before creating services
    verify = requests.get(
        f"{supabase_url}/rest/v1/service_categories?id=eq.{cat_id}&select=id",
        headers=supabase_headers,
    )
    assert verify.status_code == 200 and verify.json(), f"Category not found after create: {cat_id}"

    # Create services one by one to avoid batch FK issues
    services = [
        {
            "tenant_id": tenant_id,
            "category_id": cat_id,
            "name": "Corte Masculino",
            "duration_min": 30,
            "price": 45.00,
            "active": True,
        },
        {
            "tenant_id": tenant_id,
            "category_id": cat_id,
            "name": "Barba",
            "duration_min": 20,
            "price": 30.00,
            "active": True,
        },
    ]

    svc_resp = requests.post(
        f"{supabase_url}/rest/v1/services",
        headers=supabase_headers,
        json=services,
    )
    assert svc_resp.status_code in (200, 201), f"Failed to create services: {svc_resp.text}"
    svc_data = svc_resp.json()
    assert len(svc_data) == 2
    names = [s["name"] for s in svc_data]
    assert "Corte Masculino" in names
    assert "Barba" in names

    # Cleanup
    for svc in svc_data:
        requests.delete(
            f"{supabase_url}/rest/v1/services?id=eq.{svc['id']}",
            headers={**supabase_headers, "Prefer": ""},
        )
    requests.delete(
        f"{supabase_url}/rest/v1/service_categories?id=eq.{cat_id}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_mark_onboarding_completed(supabase_url, supabase_headers, test_tenant):
    """Verify users table has onboarding_completed column and it's queryable.
    Note: Cannot create user row directly because users.id FK references auth.users.
    Instead we verify the schema supports the field."""
    tenant_id = test_tenant["tenant_id"]

    # Verify users table is queryable with onboarding_completed field
    get_resp = requests.get(
        f"{supabase_url}/rest/v1/users?tenant_id=eq.{tenant_id}&select=id,onboarding_completed",
        headers=supabase_headers,
    )
    assert get_resp.status_code == 200, f"Failed to query users: {get_resp.text}"
    # Table exists and column is accessible (may return empty array)
    assert isinstance(get_resp.json(), list)

    # Verify tenant exists (confirming the FK chain works)
    tenant_resp = requests.get(
        f"{supabase_url}/rest/v1/tenants?id=eq.{tenant_id}&select=id,name",
        headers=supabase_headers,
    )
    assert tenant_resp.status_code == 200
    data = tenant_resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Test Barbearia"
