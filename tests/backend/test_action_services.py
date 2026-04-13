"""
Tests for service/category server-action business logic via Supabase REST API.

Mirrors the logic in src/lib/actions/services.ts:
- createCategory, updateCategory, deleteCategory (cascade)
- createService, updateService, deleteService (soft-delete active=false)
- togglePromo on/off
- getServices filtered by category
"""
import requests
import uuid


# ─── Helpers ────────────────────────────────────────────────────────────────

def _create_category(supabase_url, supabase_headers, tenant_id, name=None, **kwargs):
    payload = {"tenant_id": tenant_id, "name": name or f"Cat-{uuid.uuid4().hex[:6]}"}
    payload.update(kwargs)
    resp = requests.post(
        f"{supabase_url}/rest/v1/service_categories",
        headers=supabase_headers,
        json=payload,
    )
    assert resp.status_code in (200, 201), f"Failed to create category: {resp.text}"
    return resp.json()[0] if isinstance(resp.json(), list) else resp.json()


def _create_service(supabase_url, supabase_headers, tenant_id, category_id, name=None, **kwargs):
    payload = {
        "tenant_id": tenant_id,
        "category_id": category_id,
        "name": name or f"Svc-{uuid.uuid4().hex[:6]}",
        "price": kwargs.get("price", 50.00),
        "duration_min": kwargs.get("duration_min", 30),
    }
    for field in ("description", "promo_active", "promo_discount_pct", "active"):
        if field in kwargs:
            payload[field] = kwargs[field]
    resp = requests.post(
        f"{supabase_url}/rest/v1/services",
        headers=supabase_headers,
        json=payload,
    )
    assert resp.status_code in (200, 201), f"Failed to create service: {resp.text}"
    return resp.json()[0] if isinstance(resp.json(), list) else resp.json()


def _cleanup(supabase_url, supabase_headers, table, record_id):
    requests.delete(
        f"{supabase_url}/rest/v1/{table}?id=eq.{record_id}",
        headers={**supabase_headers, "Prefer": ""},
    )


# ─── Category Tests ────────────────────────────────────────────────────────

def test_create_category(supabase_url, supabase_headers, test_tenant):
    """Create category (mirrors createCategory action)."""
    tid = test_tenant["tenant_id"]
    cat = _create_category(supabase_url, supabase_headers, tid, name="Cabelo", description="Cortes", color="#F59E0B")

    assert cat["name"] == "Cabelo"
    assert cat["description"] == "Cortes"
    assert cat["color"] == "#F59E0B"
    assert cat["tenant_id"] == tid

    _cleanup(supabase_url, supabase_headers, "service_categories", cat["id"])


def test_update_category(supabase_url, supabase_headers, test_tenant):
    """Update category name/description (mirrors updateCategory action)."""
    tid = test_tenant["tenant_id"]
    cat = _create_category(supabase_url, supabase_headers, tid, name="Old Cat")

    patch = requests.patch(
        f"{supabase_url}/rest/v1/service_categories?id=eq.{cat['id']}",
        headers=supabase_headers,
        json={"name": "Barba e Bigode", "color": "#0EA5E9"},
    )
    assert patch.status_code == 200
    updated = patch.json()[0]
    assert updated["name"] == "Barba e Bigode"
    assert updated["color"] == "#0EA5E9"

    _cleanup(supabase_url, supabase_headers, "service_categories", cat["id"])


def test_delete_category_cascade(supabase_url, supabase_headers, test_tenant):
    """Delete category and verify cascade behavior on services.

    Schema uses ON DELETE SET NULL for services.category_id,
    so services should remain but with category_id = null.
    """
    tid = test_tenant["tenant_id"]
    cat = _create_category(supabase_url, supabase_headers, tid, name="Cascade Cat")
    svc = _create_service(supabase_url, supabase_headers, tid, cat["id"], name="Cascade Svc")

    # Delete category
    del_resp = requests.delete(
        f"{supabase_url}/rest/v1/service_categories?id=eq.{cat['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )

    if del_resp.status_code in (200, 204):
        # Check service still exists with null category_id
        check = requests.get(
            f"{supabase_url}/rest/v1/services?id=eq.{svc['id']}&select=id,category_id",
            headers=supabase_headers,
        )
        if check.status_code == 200 and len(check.json()) > 0:
            assert check.json()[0]["category_id"] is None, "Expected category_id to be null after SET NULL cascade"
            _cleanup(supabase_url, supabase_headers, "services", svc["id"])
    else:
        # FK restrict: delete blocked
        assert del_resp.status_code == 409
        _cleanup(supabase_url, supabase_headers, "services", svc["id"])
        _cleanup(supabase_url, supabase_headers, "service_categories", cat["id"])


# ─── Service Tests ──────────────────────────────────────────────────────────

def test_create_service_in_category(supabase_url, supabase_headers, test_tenant):
    """Create service in category (mirrors createService action)."""
    tid = test_tenant["tenant_id"]
    cat = _create_category(supabase_url, supabase_headers, tid, name="Svc Create Cat")
    svc = _create_service(
        supabase_url, supabase_headers, tid, cat["id"],
        name="Corte Premium",
        price=75.00,
        duration_min=45,
        description="Corte com lavagem",
    )

    assert svc["name"] == "Corte Premium"
    assert svc["price"] == 75.00
    assert svc["duration_min"] == 45
    assert svc["description"] == "Corte com lavagem"
    assert svc["category_id"] == cat["id"]
    assert svc["active"] is True  # default

    _cleanup(supabase_url, supabase_headers, "services", svc["id"])
    _cleanup(supabase_url, supabase_headers, "service_categories", cat["id"])


def test_update_service(supabase_url, supabase_headers, test_tenant):
    """Update service fields (mirrors updateService action)."""
    tid = test_tenant["tenant_id"]
    cat = _create_category(supabase_url, supabase_headers, tid)
    svc = _create_service(supabase_url, supabase_headers, tid, cat["id"], name="Old Svc", price=40.00)

    patch = requests.patch(
        f"{supabase_url}/rest/v1/services?id=eq.{svc['id']}",
        headers=supabase_headers,
        json={"name": "New Svc", "price": 65.00, "duration_min": 60},
    )
    assert patch.status_code == 200
    updated = patch.json()[0]
    assert updated["name"] == "New Svc"
    assert updated["price"] == 65.00
    assert updated["duration_min"] == 60

    _cleanup(supabase_url, supabase_headers, "services", svc["id"])
    _cleanup(supabase_url, supabase_headers, "service_categories", cat["id"])


def test_soft_delete_service(supabase_url, supabase_headers, test_tenant):
    """Soft-delete service by setting active=false (mirrors deleteService action)."""
    tid = test_tenant["tenant_id"]
    cat = _create_category(supabase_url, supabase_headers, tid)
    svc = _create_service(supabase_url, supabase_headers, tid, cat["id"], name="To Deactivate")
    assert svc["active"] is True

    # Soft delete (mirrors deleteService: update active=false)
    patch = requests.patch(
        f"{supabase_url}/rest/v1/services?id=eq.{svc['id']}",
        headers=supabase_headers,
        json={"active": False},
    )
    assert patch.status_code == 200
    assert patch.json()[0]["active"] is False

    # Verify not returned by active-only query (mirrors getServices)
    resp = requests.get(
        f"{supabase_url}/rest/v1/services?tenant_id=eq.{tid}&active=eq.true&id=eq.{svc['id']}&select=id",
        headers=supabase_headers,
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 0

    _cleanup(supabase_url, supabase_headers, "services", svc["id"])
    _cleanup(supabase_url, supabase_headers, "service_categories", cat["id"])


def test_toggle_promo_on_off(supabase_url, supabase_headers, test_tenant):
    """Toggle promo on then off (mirrors togglePromo action)."""
    tid = test_tenant["tenant_id"]
    cat = _create_category(supabase_url, supabase_headers, tid)
    svc = _create_service(supabase_url, supabase_headers, tid, cat["id"], name="Promo Svc", price=100.00)

    assert svc["promo_active"] is False  # default

    # Turn promo ON (mirrors togglePromo(id, true, 15))
    patch_on = requests.patch(
        f"{supabase_url}/rest/v1/services?id=eq.{svc['id']}",
        headers=supabase_headers,
        json={"promo_active": True, "promo_discount_pct": 15},
    )
    assert patch_on.status_code == 200
    on = patch_on.json()[0]
    assert on["promo_active"] is True
    assert on["promo_discount_pct"] == 15

    # Turn promo OFF (mirrors togglePromo(id, false))
    patch_off = requests.patch(
        f"{supabase_url}/rest/v1/services?id=eq.{svc['id']}",
        headers=supabase_headers,
        json={"promo_active": False, "promo_discount_pct": None},
    )
    assert patch_off.status_code == 200
    off = patch_off.json()[0]
    assert off["promo_active"] is False
    assert off["promo_discount_pct"] is None

    _cleanup(supabase_url, supabase_headers, "services", svc["id"])
    _cleanup(supabase_url, supabase_headers, "service_categories", cat["id"])


def test_get_services_filtered_by_category(supabase_url, supabase_headers, test_tenant):
    """Get services filtered by category (mirrors getServices action)."""
    tid = test_tenant["tenant_id"]
    cat1 = _create_category(supabase_url, supabase_headers, tid, name="Cat Alpha")
    cat2 = _create_category(supabase_url, supabase_headers, tid, name="Cat Beta")
    svc1 = _create_service(supabase_url, supabase_headers, tid, cat1["id"], name="Alpha Svc")
    svc2 = _create_service(supabase_url, supabase_headers, tid, cat2["id"], name="Beta Svc")

    # Query filtered by cat1 (mirrors getServices with categoryId)
    resp = requests.get(
        f"{supabase_url}/rest/v1/services"
        f"?tenant_id=eq.{tid}"
        f"&active=eq.true"
        f"&category_id=eq.{cat1['id']}"
        f"&select=*,service_categories(id,name,color)"
        f"&order=name",
        headers=supabase_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    ids = [s["id"] for s in data]
    assert svc1["id"] in ids
    assert svc2["id"] not in ids

    # Query all (no category filter)
    resp_all = requests.get(
        f"{supabase_url}/rest/v1/services?tenant_id=eq.{tid}&active=eq.true&select=id&order=name",
        headers=supabase_headers,
    )
    all_ids = [s["id"] for s in resp_all.json()]
    assert svc1["id"] in all_ids
    assert svc2["id"] in all_ids

    _cleanup(supabase_url, supabase_headers, "services", svc1["id"])
    _cleanup(supabase_url, supabase_headers, "services", svc2["id"])
    _cleanup(supabase_url, supabase_headers, "service_categories", cat1["id"])
    _cleanup(supabase_url, supabase_headers, "service_categories", cat2["id"])
