"""
Backend tests for settings.test_mode and settings.test_numbers columns.
Tests column existence, defaults, CRUD operations, and data integrity.
"""
import pytest
import requests


@pytest.fixture(scope="module")
def settings_row(supabase_headers, supabase_url, test_tenant):
    """Ensure a settings row exists and return tenant_id."""
    tenant_id = test_tenant["tenant_id"]

    # Upsert settings row with defaults
    resp = requests.post(
        f"{supabase_url}/rest/v1/settings",
        headers={**supabase_headers, "Prefer": "resolution=ignore-duplicates,return=representation"},
        json={"tenant_id": tenant_id},
    )
    # Accept 200/201 (created) or 409/empty (already exists)
    assert resp.status_code in (200, 201, 409) or resp.text == "[]", (
        f"Failed to ensure settings row: {resp.text}"
    )
    return {"tenant_id": tenant_id}


class TestTestModeColumns:

    def test_test_mode_column_exists_defaults_false(self, supabase_headers, supabase_url, settings_row):
        """test_mode should exist and default to false."""
        resp = requests.get(
            f"{supabase_url}/rest/v1/settings"
            f"?tenant_id=eq.{settings_row['tenant_id']}&select=test_mode",
            headers=supabase_headers,
        )
        assert resp.status_code == 200
        rows = resp.json()
        assert len(rows) == 1, "Expected exactly one settings row"
        assert rows[0]["test_mode"] is False, (
            f"Default test_mode should be False, got {rows[0]['test_mode']}"
        )

    def test_test_numbers_column_exists_defaults_empty(self, supabase_headers, supabase_url, settings_row):
        """test_numbers should exist and default to empty array."""
        resp = requests.get(
            f"{supabase_url}/rest/v1/settings"
            f"?tenant_id=eq.{settings_row['tenant_id']}&select=test_numbers",
            headers=supabase_headers,
        )
        assert resp.status_code == 200
        rows = resp.json()
        assert len(rows) == 1
        val = rows[0]["test_numbers"]
        assert isinstance(val, list), f"test_numbers should be a list, got {type(val)}"
        assert val == [], f"Default test_numbers should be [], got {val}"

    def test_can_enable_test_mode(self, supabase_headers, supabase_url, settings_row):
        """Should be able to set test_mode=true."""
        resp = requests.patch(
            f"{supabase_url}/rest/v1/settings?tenant_id=eq.{settings_row['tenant_id']}",
            headers=supabase_headers,
            json={"test_mode": True},
        )
        assert resp.status_code in (200, 204), f"PATCH failed: {resp.text}"

        verify = requests.get(
            f"{supabase_url}/rest/v1/settings"
            f"?tenant_id=eq.{settings_row['tenant_id']}&select=test_mode",
            headers=supabase_headers,
        )
        assert verify.json()[0]["test_mode"] is True

    def test_can_add_test_numbers(self, supabase_headers, supabase_url, settings_row):
        """Should be able to store test phone numbers."""
        numbers = ["5511999990001", "5511888880002", "5511777770003"]
        resp = requests.patch(
            f"{supabase_url}/rest/v1/settings?tenant_id=eq.{settings_row['tenant_id']}",
            headers=supabase_headers,
            json={"test_numbers": numbers},
        )
        assert resp.status_code in (200, 204)

        verify = requests.get(
            f"{supabase_url}/rest/v1/settings"
            f"?tenant_id=eq.{settings_row['tenant_id']}&select=test_numbers",
            headers=supabase_headers,
        )
        stored = verify.json()[0]["test_numbers"]
        assert stored == numbers, f"Expected {numbers}, got {stored}"

    def test_can_clear_test_numbers(self, supabase_headers, supabase_url, settings_row):
        """Should be able to clear test_numbers back to empty."""
        resp = requests.patch(
            f"{supabase_url}/rest/v1/settings?tenant_id=eq.{settings_row['tenant_id']}",
            headers=supabase_headers,
            json={"test_numbers": []},
        )
        assert resp.status_code in (200, 204)

        verify = requests.get(
            f"{supabase_url}/rest/v1/settings"
            f"?tenant_id=eq.{settings_row['tenant_id']}&select=test_numbers",
            headers=supabase_headers,
        )
        assert verify.json()[0]["test_numbers"] == []

    def test_can_disable_test_mode(self, supabase_headers, supabase_url, settings_row):
        """Should be able to set test_mode back to false."""
        requests.patch(
            f"{supabase_url}/rest/v1/settings?tenant_id=eq.{settings_row['tenant_id']}",
            headers=supabase_headers,
            json={"test_mode": True},
        )
        resp = requests.patch(
            f"{supabase_url}/rest/v1/settings?tenant_id=eq.{settings_row['tenant_id']}",
            headers=supabase_headers,
            json={"test_mode": False},
        )
        assert resp.status_code in (200, 204)

        verify = requests.get(
            f"{supabase_url}/rest/v1/settings"
            f"?tenant_id=eq.{settings_row['tenant_id']}&select=test_mode",
            headers=supabase_headers,
        )
        assert verify.json()[0]["test_mode"] is False

    def test_test_mode_and_numbers_independent(self, supabase_headers, supabase_url, settings_row):
        """test_mode and test_numbers should be independent fields."""
        # Set numbers without enabling test_mode
        requests.patch(
            f"{supabase_url}/rest/v1/settings?tenant_id=eq.{settings_row['tenant_id']}",
            headers=supabase_headers,
            json={"test_mode": False, "test_numbers": ["5511123456789"]},
        )
        verify = requests.get(
            f"{supabase_url}/rest/v1/settings"
            f"?tenant_id=eq.{settings_row['tenant_id']}&select=test_mode,test_numbers",
            headers=supabase_headers,
        )
        row = verify.json()[0]
        assert row["test_mode"] is False
        assert "5511123456789" in row["test_numbers"]
