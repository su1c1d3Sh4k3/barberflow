"""
Tests for contacts search, pagination, CSV import, and bulk update features.
"""
import requests
import pytest
import time


class TestContactsSearch:
    """Search contacts by name and phone."""

    @pytest.fixture(autouse=True)
    def _setup(self, app_url, api_headers, test_tenant):
        """Create test contacts for search tests."""
        self.url = app_url
        self.headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        self.tenant_id = test_tenant["tenant_id"]

        # Create contacts with distinct names/phones for search
        self.contacts = [
            {"name": "Carlos Barbosa", "phone": "5511900010001"},
            {"name": "Maria Silva", "phone": "5511900010002"},
            {"name": "Carlos Eduardo", "phone": "5511900010003"},
            {"name": "Ana Paula", "phone": "5521900010004"},
            {"name": "Pedro Santos", "phone": "5511900010005"},
        ]
        for c in self.contacts:
            requests.post(f"{self.url}/api/contacts", headers=self.headers, json=c)

    def test_search_by_name_returns_matching(self):
        """Search by name using ilike should return matching contacts."""
        resp = requests.get(
            f"{self.url}/api/contacts?search=Carlos",
            headers=self.headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        items = body["data"]["items"]
        assert len(items) >= 2
        names = [c["name"] for c in items]
        assert all("Carlos" in n for n in names)

    def test_search_by_phone_returns_matching(self):
        """Search by phone fragment should return matching contacts."""
        resp = requests.get(
            f"{self.url}/api/contacts?search=5521",
            headers=self.headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        items = body["data"]["items"]
        assert len(items) >= 1
        phones = [c["phone"] for c in items]
        assert any("5521" in p for p in phones)

    def test_search_no_results(self):
        """Search for non-existent term returns empty list."""
        resp = requests.get(
            f"{self.url}/api/contacts?search=ZZZnonexistent",
            headers=self.headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert len(body["data"]["items"]) == 0
        assert body["data"]["total"] == 0

    def test_search_case_insensitive(self):
        """Search should be case-insensitive."""
        resp = requests.get(
            f"{self.url}/api/contacts?search=carlos",
            headers=self.headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        items = body["data"]["items"]
        assert len(items) >= 2


class TestContactsPagination:
    """Pagination returns correct page size and supports offset."""

    @pytest.fixture(autouse=True)
    def _setup(self, app_url, api_headers, test_tenant):
        self.url = app_url
        self.headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        self.tenant_id = test_tenant["tenant_id"]

        # Ensure we have enough contacts (create 25)
        for i in range(25):
            requests.post(
                f"{self.url}/api/contacts",
                headers=self.headers,
                json={"name": f"PagTest User {i:03d}", "phone": f"55119900{i:05d}"},
            )

    def test_default_page_size(self):
        """Default limit should be 20."""
        resp = requests.get(f"{self.url}/api/contacts", headers=self.headers)
        assert resp.status_code == 200
        body = resp.json()
        data = body["data"]
        assert len(data["items"]) <= 20
        assert data["limit"] == 20
        assert data["offset"] == 0
        assert data["total"] >= 25

    def test_custom_limit(self):
        """Custom limit=5 should return 5 items."""
        resp = requests.get(
            f"{self.url}/api/contacts?limit=5",
            headers=self.headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]["items"]) == 5

    def test_offset_returns_different_page(self):
        """Offset should return different contacts."""
        resp1 = requests.get(
            f"{self.url}/api/contacts?limit=5&offset=0",
            headers=self.headers,
        )
        resp2 = requests.get(
            f"{self.url}/api/contacts?limit=5&offset=5",
            headers=self.headers,
        )
        assert resp1.status_code == 200
        assert resp2.status_code == 200
        ids1 = {c["id"] for c in resp1.json()["data"]["items"]}
        ids2 = {c["id"] for c in resp2.json()["data"]["items"]}
        # The two pages should not fully overlap (may share some if fewer contacts exist)
        if len(ids1) > 0 and len(ids2) > 0:
            assert ids1 != ids2, "Pages should return different results"

    def test_total_count_returned(self):
        """Response should include total count."""
        resp = requests.get(
            f"{self.url}/api/contacts?limit=3",
            headers=self.headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "total" in body["data"]
        assert body["data"]["total"] >= 25


class TestContactsCsvImport:
    """CSV import endpoint processes parsed rows."""

    @pytest.fixture(autouse=True)
    def _setup(self, app_url, api_headers, test_tenant):
        self.url = app_url
        self.headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        self.tenant_id = test_tenant["tenant_id"]

    def test_csv_import_success(self):
        """Bulk import of valid rows should succeed."""
        rows = [
            {"name": "CSV User 1", "phone": "5511800010001"},
            {"name": "CSV User 2", "phone": "5511800010002"},
            {"name": "CSV User 3", "phone": "5511800010003"},
        ]
        resp = requests.post(
            f"{self.url}/api/contacts/import-csv",
            headers=self.headers,
            json={"rows": rows},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body.get("success") is True
        assert body["data"]["success"] == 3
        assert body["data"]["errors"] == 0

    def test_csv_import_skips_invalid(self):
        """Rows with missing name/phone should be skipped."""
        rows = [
            {"name": "Valid User", "phone": "5511800020001"},
            {"name": "", "phone": "5511800020002"},  # empty name
            {"name": "Short Phone", "phone": "123"},  # phone too short
        ]
        resp = requests.post(
            f"{self.url}/api/contacts/import-csv",
            headers=self.headers,
            json={"rows": rows},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["data"]["success"] == 1
        assert body["data"]["errors"] == 2

    def test_csv_import_empty_rows(self):
        """Empty rows array should return 422."""
        resp = requests.post(
            f"{self.url}/api/contacts/import-csv",
            headers=self.headers,
            json={"rows": []},
        )
        assert resp.status_code == 422

    def test_csv_import_upsert_existing(self):
        """Importing existing phone should upsert (update name)."""
        phone = "5511800030001"
        # Create first
        requests.post(
            f"{self.url}/api/contacts",
            headers=self.headers,
            json={"name": "Original Name", "phone": phone},
        )
        # Import with same phone, different name
        resp = requests.post(
            f"{self.url}/api/contacts/import-csv",
            headers=self.headers,
            json={"rows": [{"name": "Updated Name", "phone": phone}]},
        )
        assert resp.status_code == 201
        assert resp.json()["data"]["success"] == 1


class TestContactsBulkUpdate:
    """Bulk update contacts endpoint."""

    @pytest.fixture(autouse=True)
    def _setup(self, app_url, api_headers, test_tenant):
        self.url = app_url
        self.headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
        self.tenant_id = test_tenant["tenant_id"]

        # Create contacts for bulk testing
        self.contact_ids = []
        for i in range(3):
            resp = requests.post(
                f"{self.url}/api/contacts",
                headers=self.headers,
                json={"name": f"Bulk User {i}", "phone": f"55117000{i:05d}"},
            )
            if resp.status_code == 201:
                self.contact_ids.append(resp.json()["data"]["id"])

    def test_bulk_block_contacts(self):
        """Bulk update status to bloqueado should work."""
        resp = requests.patch(
            f"{self.url}/api/contacts/bulk",
            headers=self.headers,
            json={
                "ids": self.contact_ids,
                "updates": {"status": "bloqueado"},
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True
        assert body["data"]["updated"] == len(self.contact_ids)

        # Verify contacts are blocked
        for cid in self.contact_ids:
            r = requests.get(f"{self.url}/api/contacts/{cid}", headers=self.headers)
            if r.status_code == 200:
                assert r.json()["data"]["status"] == "bloqueado"

    def test_bulk_add_tags(self):
        """Bulk update tags should work."""
        resp = requests.patch(
            f"{self.url}/api/contacts/bulk",
            headers=self.headers,
            json={
                "ids": self.contact_ids[:2],
                "updates": {"tags": ["vip", "promo"]},
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["updated"] == 2

    def test_bulk_empty_ids_fails(self):
        """Empty ids array should return 422."""
        resp = requests.patch(
            f"{self.url}/api/contacts/bulk",
            headers=self.headers,
            json={"ids": [], "updates": {"status": "bloqueado"}},
        )
        assert resp.status_code == 422

    def test_bulk_disallowed_fields_rejected(self):
        """Attempting to update disallowed fields should fail."""
        resp = requests.patch(
            f"{self.url}/api/contacts/bulk",
            headers=self.headers,
            json={
                "ids": self.contact_ids,
                "updates": {"tenant_id": "malicious-id"},
            },
        )
        assert resp.status_code == 422

    def test_bulk_update_ia_enabled(self):
        """Bulk toggle ia_enabled should work."""
        resp = requests.patch(
            f"{self.url}/api/contacts/bulk",
            headers=self.headers,
            json={
                "ids": self.contact_ids,
                "updates": {"ia_enabled": False},
            },
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["updated"] == len(self.contact_ids)
