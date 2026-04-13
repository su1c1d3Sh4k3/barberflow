"""
Tests for /api/plans endpoint — list available plans.
"""
import requests
import pytest


class TestPlansAPI:
    """Verify the plans listing endpoint."""

    def test_list_plans_no_auth_required(self, app_url):
        """GET /api/plans should work without auth (public endpoint)."""
        resp = requests.get(f"{app_url}/api/plans")
        assert resp.status_code == 200, (
            f"Expected 200 for public plans endpoint, got {resp.status_code}: {resp.text}"
        )
        body = resp.json()
        assert body.get("success") is True
        assert isinstance(body.get("data"), list)

    def test_plans_contain_essencial(self, app_url):
        """Plans list should contain at least one 'essencial' tier plan."""
        resp = requests.get(f"{app_url}/api/plans")
        assert resp.status_code == 200
        plans = resp.json().get("data", [])
        essencial_plans = [p for p in plans if p.get("tier") == "essencial"]
        assert len(essencial_plans) >= 1, "Should have at least one Essencial plan"

    def test_plans_contain_ia(self, app_url):
        """Plans list should contain at least one 'ia' tier plan."""
        resp = requests.get(f"{app_url}/api/plans")
        assert resp.status_code == 200
        plans = resp.json().get("data", [])
        ia_plans = [p for p in plans if p.get("tier") == "ia"]
        assert len(ia_plans) >= 1, "Should have at least one IA plan"

    def test_plans_have_required_fields(self, app_url):
        """Each plan should have all required fields."""
        resp = requests.get(f"{app_url}/api/plans")
        assert resp.status_code == 200
        plans = resp.json().get("data", [])
        assert len(plans) > 0, "Should return at least one plan"
        required_fields = ["id", "name", "tier", "price_monthly", "total_value", "cycle_months"]
        for plan in plans:
            for field in required_fields:
                assert field in plan, f"Plan {plan.get('id', '?')} missing field '{field}'"

    def test_plans_prices_positive(self, app_url):
        """All plan prices should be positive."""
        resp = requests.get(f"{app_url}/api/plans")
        plans = resp.json().get("data", [])
        for plan in plans:
            assert plan.get("price_monthly", 0) > 0, (
                f"Plan {plan['id']} has non-positive price_monthly: {plan.get('price_monthly')}"
            )
            assert plan.get("total_value", 0) > 0, (
                f"Plan {plan['id']} has non-positive total_value: {plan.get('total_value')}"
            )

    def test_plans_only_active(self, app_url):
        """All returned plans should be active."""
        resp = requests.get(f"{app_url}/api/plans")
        plans = resp.json().get("data", [])
        for plan in plans:
            assert plan.get("active") is True, (
                f"Plan {plan['id']} is not active but was returned"
            )

    def test_plans_billing_types(self, app_url):
        """Plans should cover multiple billing types."""
        resp = requests.get(f"{app_url}/api/plans")
        plans = resp.json().get("data", [])
        billing_types = set(p.get("billing_type") for p in plans)
        assert len(billing_types) >= 2, (
            f"Expected multiple billing types, got: {billing_types}"
        )
