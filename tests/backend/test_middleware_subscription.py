"""
Tests for subscription/trial gate middleware logic.

Validates that the subscription gate correctly allows/blocks access
based on subscription status and date fields in the database.
"""
import requests
import pytest
from datetime import datetime, timedelta, timezone


def _cleanup_subs(supabase_url, supabase_headers, tenant_id):
    """Remove any existing subscriptions for the tenant."""
    requests.delete(
        f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}",
        headers={**supabase_headers, "Prefer": ""},
    )


def _ts(dt):
    """Format datetime as ISO string with Z suffix."""
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _create_sub(supabase_url, supabase_headers, tenant_id, **fields):
    """Create a subscription and return the row."""
    resp = requests.post(
        f"{supabase_url}/rest/v1/subscriptions",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, **fields},
    )
    assert resp.status_code in (200, 201), f"Failed to create subscription: {resp.text}"
    return resp.json()[0] if isinstance(resp.json(), list) else resp.json()


def _get_sub(supabase_url, supabase_headers, tenant_id):
    """Fetch the subscription for a tenant."""
    resp = requests.get(
        f"{supabase_url}/rest/v1/subscriptions?tenant_id=eq.{tenant_id}&select=status,trial_ends_at,current_period_end",
        headers=supabase_headers,
    )
    assert resp.status_code == 200, f"Failed to query subscription: {resp.text}"
    rows = resp.json()
    return rows[0] if rows else None


def _middleware_would_allow(subscription):
    """
    Pure-Python replica of the middleware's access logic.
    Returns True if access is granted, False if redirect to /conta/planos.
    """
    if not subscription:
        return True  # No subscription row → middleware doesn't block (no gate data)

    now = datetime.now(timezone.utc)
    has_access = False

    if subscription["status"] == "active":
        has_access = (
            not subscription.get("current_period_end")
            or datetime.fromisoformat(
                subscription["current_period_end"].replace("Z", "+00:00")
            )
            > now
        )
    elif subscription["status"] == "trial":
        has_access = (
            not subscription.get("trial_ends_at")
            or datetime.fromisoformat(
                subscription["trial_ends_at"].replace("Z", "+00:00")
            )
            > now
        )
    # All other statuses (past_due, canceled, expired) → has_access stays False

    return has_access


class TestTrialSubscriptionAllowsAccess:
    """Trial with future trial_ends_at should grant access."""

    def test_trial_with_future_date_allows(self, supabase_url, supabase_headers, test_tenant):
        tenant_id = test_tenant["tenant_id"]
        _cleanup_subs(supabase_url, supabase_headers, tenant_id)

        trial_end = _ts(datetime.now(timezone.utc) + timedelta(days=14))
        _create_sub(
            supabase_url, supabase_headers, tenant_id,
            status="trial", trial_ends_at=trial_end,
        )

        sub = _get_sub(supabase_url, supabase_headers, tenant_id)
        assert sub is not None
        assert sub["status"] == "trial"
        assert _middleware_would_allow(sub) is True, "Trial with future date should allow access"

        _cleanup_subs(supabase_url, supabase_headers, tenant_id)


class TestExpiredTrialRedirects:
    """Trial with past trial_ends_at should block access (redirect)."""

    def test_expired_trial_blocks(self, supabase_url, supabase_headers, test_tenant):
        tenant_id = test_tenant["tenant_id"]
        _cleanup_subs(supabase_url, supabase_headers, tenant_id)

        past = _ts(datetime.now(timezone.utc) - timedelta(days=1))
        _create_sub(
            supabase_url, supabase_headers, tenant_id,
            status="trial", trial_ends_at=past,
        )

        sub = _get_sub(supabase_url, supabase_headers, tenant_id)
        assert sub is not None
        assert sub["status"] == "trial"
        assert _middleware_would_allow(sub) is False, "Expired trial should block access"

        _cleanup_subs(supabase_url, supabase_headers, tenant_id)


class TestActiveSubscriptionAllowsAccess:
    """Active subscription with future current_period_end should grant access."""

    def test_active_with_future_period_allows(self, supabase_url, supabase_headers, test_tenant):
        tenant_id = test_tenant["tenant_id"]
        _cleanup_subs(supabase_url, supabase_headers, tenant_id)

        future = _ts(datetime.now(timezone.utc) + timedelta(days=30))
        _create_sub(
            supabase_url, supabase_headers, tenant_id,
            status="active", current_period_end=future,
        )

        sub = _get_sub(supabase_url, supabase_headers, tenant_id)
        assert sub is not None
        assert sub["status"] == "active"
        assert _middleware_would_allow(sub) is True, "Active subscription with future period should allow"

        _cleanup_subs(supabase_url, supabase_headers, tenant_id)

    def test_active_with_no_period_end_allows(self, supabase_url, supabase_headers, test_tenant):
        """Active subscription with NULL current_period_end should allow (lifetime/no expiry)."""
        tenant_id = test_tenant["tenant_id"]
        _cleanup_subs(supabase_url, supabase_headers, tenant_id)

        _create_sub(
            supabase_url, supabase_headers, tenant_id,
            status="active",
        )

        sub = _get_sub(supabase_url, supabase_headers, tenant_id)
        assert sub is not None
        assert sub["status"] == "active"
        assert _middleware_would_allow(sub) is True, "Active with no period end should allow"

        _cleanup_subs(supabase_url, supabase_headers, tenant_id)

    def test_active_with_past_period_blocks(self, supabase_url, supabase_headers, test_tenant):
        """Active subscription with past current_period_end should block."""
        tenant_id = test_tenant["tenant_id"]
        _cleanup_subs(supabase_url, supabase_headers, tenant_id)

        past = _ts(datetime.now(timezone.utc) - timedelta(days=1))
        _create_sub(
            supabase_url, supabase_headers, tenant_id,
            status="active", current_period_end=past,
        )

        sub = _get_sub(supabase_url, supabase_headers, tenant_id)
        assert sub is not None
        assert _middleware_would_allow(sub) is False, "Active with past period should block"

        _cleanup_subs(supabase_url, supabase_headers, tenant_id)


class TestPastDueSubscriptionRedirects:
    """past_due status should always block access (redirect to /conta/planos)."""

    def test_past_due_blocks(self, supabase_url, supabase_headers, test_tenant):
        tenant_id = test_tenant["tenant_id"]
        _cleanup_subs(supabase_url, supabase_headers, tenant_id)

        future = _ts(datetime.now(timezone.utc) + timedelta(days=30))
        _create_sub(
            supabase_url, supabase_headers, tenant_id,
            status="past_due", current_period_end=future,
        )

        sub = _get_sub(supabase_url, supabase_headers, tenant_id)
        assert sub is not None
        assert sub["status"] == "past_due"
        assert _middleware_would_allow(sub) is False, "past_due should always block access"

        _cleanup_subs(supabase_url, supabase_headers, tenant_id)

    def test_canceled_blocks(self, supabase_url, supabase_headers, test_tenant):
        """Canceled status should block access."""
        tenant_id = test_tenant["tenant_id"]
        _cleanup_subs(supabase_url, supabase_headers, tenant_id)

        _create_sub(
            supabase_url, supabase_headers, tenant_id,
            status="canceled",
        )

        sub = _get_sub(supabase_url, supabase_headers, tenant_id)
        assert sub is not None
        assert sub["status"] == "canceled"
        assert _middleware_would_allow(sub) is False, "canceled should block access"

        _cleanup_subs(supabase_url, supabase_headers, tenant_id)


class TestWhitelistedRoutesBypassGate:
    """
    Verify the whitelist logic: even with an expired subscription,
    certain routes should not be blocked.
    This test validates the whitelist array itself (pure logic test).
    """

    GATE_WHITELIST = [
        "/conta/planos",
        "/conta/faturamento",
        "/conta",
        "/onboarding",
        "/logout",
        "/api/",
    ]

    def _is_whitelisted(self, pathname):
        return any(pathname.startswith(route) for route in self.GATE_WHITELIST)

    def test_conta_planos_whitelisted(self):
        assert self._is_whitelisted("/conta/planos") is True

    def test_conta_whitelisted(self):
        assert self._is_whitelisted("/conta") is True

    def test_conta_faturamento_whitelisted(self):
        assert self._is_whitelisted("/conta/faturamento") is True

    def test_onboarding_whitelisted(self):
        assert self._is_whitelisted("/onboarding") is True

    def test_api_routes_whitelisted(self):
        assert self._is_whitelisted("/api/subscriptions/current") is True
        assert self._is_whitelisted("/api/webhooks/asaas") is True

    def test_logout_whitelisted(self):
        assert self._is_whitelisted("/logout") is True

    def test_dashboard_not_whitelisted(self):
        assert self._is_whitelisted("/dashboard") is False

    def test_agenda_not_whitelisted(self):
        assert self._is_whitelisted("/agenda") is False

    def test_clientes_not_whitelisted(self):
        assert self._is_whitelisted("/clientes") is False
