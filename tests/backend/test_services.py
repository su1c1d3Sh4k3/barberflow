"""
Tests for services and service_categories tables: CRUD, FK, promo toggle, cascade.
"""
import requests
import uuid


def test_create_category(supabase_url, supabase_headers, test_tenant):
    """Insert a service category."""
    tenant_id = test_tenant["tenant_id"]
    resp = requests.post(
        f"{supabase_url}/rest/v1/service_categories",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "Barba"},
    )
    assert resp.status_code in (200, 201), f"Failed: {resp.text}"
    cat = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
    assert cat["name"] == "Barba"
    assert cat["tenant_id"] == tenant_id

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/service_categories?id=eq.{cat['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_create_service(supabase_url, supabase_headers, test_tenant):
    """Insert a service linked to a category."""
    tenant_id = test_tenant["tenant_id"]

    # Create category first
    cat_resp = requests.post(
        f"{supabase_url}/rest/v1/service_categories",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "Cabelo"},
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
            "name": "Corte Degradê",
            "price": 5500,
            "duration_min": 45,
        },
    )
    assert svc_resp.status_code in (200, 201), f"Failed: {svc_resp.text}"
    svc = svc_resp.json()[0] if isinstance(svc_resp.json(), list) else svc_resp.json()
    assert svc["name"] == "Corte Degradê"
    assert svc["price"] == 5500
    assert svc["duration_min"] == 45
    assert svc["category_id"] == cat["id"]

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/services?id=eq.{svc['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
    requests.delete(
        f"{supabase_url}/rest/v1/service_categories?id=eq.{cat['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_service_promo_toggle(supabase_url, supabase_headers, test_tenant):
    """Update promo_active and promo_discount_pct on a service."""
    tenant_id = test_tenant["tenant_id"]

    cat_resp = requests.post(
        f"{supabase_url}/rest/v1/service_categories",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "Promo Cat"},
    )
    cat = cat_resp.json()[0] if isinstance(cat_resp.json(), list) else cat_resp.json()

    svc_resp = requests.post(
        f"{supabase_url}/rest/v1/services",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "category_id": cat["id"],
            "name": "Promo Service",
            "price": 6000,
            "duration_min": 30,
        },
    )
    svc = svc_resp.json()[0] if isinstance(svc_resp.json(), list) else svc_resp.json()

    # Toggle promo on
    patch_resp = requests.patch(
        f"{supabase_url}/rest/v1/services?id=eq.{svc['id']}",
        headers=supabase_headers,
        json={"promo_active": True, "promo_discount_pct": 20},
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()[0]
    assert updated["promo_active"] is True
    assert updated["promo_discount_pct"] == 20

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/services?id=eq.{svc['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
    requests.delete(
        f"{supabase_url}/rest/v1/service_categories?id=eq.{cat['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_service_category_fk(supabase_url, supabase_headers, test_tenant):
    """Verify FK constraint: service with non-existent category fails."""
    tenant_id = test_tenant["tenant_id"]
    fake_cat_id = str(uuid.uuid4())
    resp = requests.post(
        f"{supabase_url}/rest/v1/services",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "category_id": fake_cat_id,
            "name": "Orphan Service",
            "price": 3000,
            "duration_min": 20,
        },
    )
    assert resp.status_code in (400, 409), f"Expected FK error, got {resp.status_code}: {resp.text}"


def test_delete_category_cascades(supabase_url, supabase_headers, test_tenant):
    """Check what happens to services when parent category is deleted."""
    tenant_id = test_tenant["tenant_id"]

    # Create category
    cat_resp = requests.post(
        f"{supabase_url}/rest/v1/service_categories",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "Cascade Test Cat"},
    )
    cat = cat_resp.json()[0] if isinstance(cat_resp.json(), list) else cat_resp.json()

    # Create service
    svc_resp = requests.post(
        f"{supabase_url}/rest/v1/services",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "category_id": cat["id"],
            "name": "Cascade Service",
            "price": 3000,
            "duration_min": 20,
        },
    )
    svc = svc_resp.json()[0] if isinstance(svc_resp.json(), list) else svc_resp.json()

    # Delete category
    del_resp = requests.delete(
        f"{supabase_url}/rest/v1/service_categories?id=eq.{cat['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )

    if del_resp.status_code in (200, 204):
        # Category was deleted; check if service was cascaded or became orphan
        check = requests.get(
            f"{supabase_url}/rest/v1/services?id=eq.{svc['id']}&select=*",
            headers=supabase_headers,
        )
        if check.status_code == 200 and len(check.json()) > 0:
            # Service still exists (no cascade) - clean it up
            requests.delete(
                f"{supabase_url}/rest/v1/services?id=eq.{svc['id']}",
                headers={**supabase_headers, "Prefer": ""},
            )
        # If service was deleted by cascade, nothing to clean
    else:
        # Delete blocked (restrict) - means FK prevents cascade
        assert del_resp.status_code == 409
        # Cleanup manually
        requests.delete(
            f"{supabase_url}/rest/v1/services?id=eq.{svc['id']}",
            headers={**supabase_headers, "Prefer": ""},
        )
        requests.delete(
            f"{supabase_url}/rest/v1/service_categories?id=eq.{cat['id']}",
            headers={**supabase_headers, "Prefer": ""},
        )
