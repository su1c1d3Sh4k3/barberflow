"""
Tests for /api/services/combos endpoints.

NOTE: Requires migration 008_service_combos.sql to be applied.
Run via Supabase Dashboard SQL Editor if not yet applied.
"""
import os
import requests
import pytest
from dotenv import load_dotenv

_env = os.path.join(os.path.dirname(__file__), "..", "..", ".env.local")
load_dotenv(_env)

def _check_migration():
    """Check if service_combos table and is_combo column exist."""
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        return False
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    r = requests.get(f"{url}/rest/v1/services?select=is_combo&limit=1", headers=h, timeout=5)
    return r.status_code == 200

_migration_applied = _check_migration()
pytestmark = pytest.mark.skipif(
    not _migration_applied,
    reason="Migration 008_service_combos.sql not yet applied"
)


@pytest.fixture(scope="module")
def combo_category(app_url, api_headers, test_tenant):
    """Create a category for combo tests."""
    headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
    resp = requests.post(
        f"{app_url}/api/categories",
        headers=headers,
        json={"name": "Categoria Combo Test", "description": "Para testes de combos"},
    )
    assert resp.status_code == 201
    return resp.json()["data"]


@pytest.fixture(scope="module")
def child_services(app_url, api_headers, test_tenant, combo_category):
    """Create two child services for combo tests."""
    headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
    services = []
    for svc in [
        {"name": "Corte Combo", "duration_min": 30, "price": 40.00},
        {"name": "Barba Combo", "duration_min": 20, "price": 25.00},
        {"name": "Sobrancelha Combo", "duration_min": 10, "price": 15.00},
    ]:
        resp = requests.post(
            f"{app_url}/api/services",
            headers=headers,
            json={**svc, "category_id": combo_category["id"]},
        )
        assert resp.status_code == 201, f"Failed to create service: {resp.text}"
        services.append(resp.json()["data"])
    return services


class TestServiceCombosAPI:
    """CRUD operations on service combos."""

    def test_create_combo(self, app_url, api_headers, test_tenant, combo_category, child_services):
        """POST /api/services/combos should create a combo service."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        payload = {
            "name": "Combo Completo",
            "description": "Corte + Barba",
            "category_id": combo_category["id"],
            "child_service_ids": [child_services[0]["id"], child_services[1]["id"]],
            "combo_discount_pct": 10,
        }
        resp = requests.post(f"{app_url}/api/services/combos", headers=headers, json=payload)
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body.get("success") is True
        combo = body["data"]
        assert combo["name"] == "Combo Completo"
        assert combo["is_combo"] is True
        # Price should be (40+25) * 0.9 = 58.50
        assert float(combo["price"]) == pytest.approx(58.50, abs=0.01)
        # Duration should be 30 + 20 = 50
        assert combo["duration_min"] == 50

    def test_create_combo_requires_min_2_services(self, app_url, api_headers, test_tenant, child_services):
        """POST /api/services/combos with <2 services should return 422."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        payload = {
            "name": "Combo Invalido",
            "child_service_ids": [child_services[0]["id"]],
        }
        resp = requests.post(f"{app_url}/api/services/combos", headers=headers, json=payload)
        assert resp.status_code == 422

    def test_list_combos(self, app_url, api_headers, test_tenant):
        """GET /api/services/combos should list all combos with children."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        resp = requests.get(f"{app_url}/api/services/combos", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        data = body["data"]
        assert isinstance(data, list)
        # Should have at least the combo we created
        assert len(data) >= 1
        combo = data[0]
        assert combo.get("is_combo") is True
        assert "children" in combo
        assert len(combo["children"]) >= 2

    def test_get_combo_by_id(self, app_url, api_headers, test_tenant, combo_category, child_services):
        """GET /api/services/combos/:id should return combo with children."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        # Create a combo first
        create_resp = requests.post(
            f"{app_url}/api/services/combos",
            headers=headers,
            json={
                "name": "Combo Para Busca",
                "category_id": combo_category["id"],
                "child_service_ids": [child_services[0]["id"], child_services[2]["id"]],
            },
        )
        assert create_resp.status_code == 201
        combo_id = create_resp.json()["data"]["id"]

        # Get by ID
        resp = requests.get(f"{app_url}/api/services/combos/{combo_id}", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert body["data"]["id"] == combo_id
        assert len(body["data"]["children"]) == 2

    def test_delete_combo(self, app_url, api_headers, test_tenant, combo_category, child_services):
        """DELETE /api/services/combos/:id should deactivate the combo."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}

        # Create a combo
        create_resp = requests.post(
            f"{app_url}/api/services/combos",
            headers=headers,
            json={
                "name": "Combo Para Deletar",
                "category_id": combo_category["id"],
                "child_service_ids": [child_services[1]["id"], child_services[2]["id"]],
            },
        )
        assert create_resp.status_code == 201
        combo_id = create_resp.json()["data"]["id"]

        # Delete
        resp = requests.delete(f"{app_url}/api/services/combos/{combo_id}", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert body["data"]["deleted"] is True

    def test_create_combo_no_discount(self, app_url, api_headers, test_tenant, combo_category, child_services):
        """POST /api/services/combos without discount should sum prices."""
        headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        payload = {
            "name": "Combo Sem Desconto",
            "category_id": combo_category["id"],
            "child_service_ids": [child_services[0]["id"], child_services[1]["id"]],
        }
        resp = requests.post(f"{app_url}/api/services/combos", headers=headers, json=payload)
        assert resp.status_code == 201
        combo = resp.json()["data"]
        # Price should be 40 + 25 = 65.00 (no discount)
        assert float(combo["price"]) == pytest.approx(65.00, abs=0.01)

    def test_combo_unauthorized(self, app_url):
        """Requests without auth should return 401."""
        resp = requests.get(
            f"{app_url}/api/services/combos",
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 401
