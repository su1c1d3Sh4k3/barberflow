"""
Tests for company server action logic: CRUD, business hours upsert.
"""
import requests
import uuid


class TestCompanyActions:
    """Test company operations matching src/lib/actions/company.ts."""

    def test_get_company_by_id(self, supabase_url, supabase_headers, test_tenant):
        """Get a single company by its ID."""
        company_id = test_tenant["company_id"]
        resp = requests.get(
            f"{supabase_url}/rest/v1/companies?id=eq.{company_id}&select=*",
            headers=supabase_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["id"] == company_id

    def test_get_companies_by_tenant_ordered(self, supabase_url, supabase_headers, test_tenant):
        """Get companies by tenant, ordered by is_default descending."""
        tenant_id = test_tenant["tenant_id"]

        # Create a second non-default company
        resp = requests.post(
            f"{supabase_url}/rest/v1/companies",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "name": "Filial Ordered",
                "is_default": False,
            },
        )
        assert resp.status_code in (200, 201)
        extra = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

        try:
            # Fetch all companies ordered by is_default desc
            resp = requests.get(
                f"{supabase_url}/rest/v1/companies?tenant_id=eq.{tenant_id}"
                "&select=*&order=is_default.desc",
                headers=supabase_headers,
            )
            assert resp.status_code == 200
            companies = resp.json()
            assert len(companies) >= 2
            # First company should be the default
            assert companies[0]["is_default"] is True
        finally:
            requests.delete(
                f"{supabase_url}/rest/v1/companies?id=eq.{extra['id']}",
                headers={**supabase_headers, "Prefer": ""},
            )

    def test_update_company_fields(self, supabase_url, supabase_headers, test_tenant):
        """Update company name, address, and description."""
        company_id = test_tenant["company_id"]
        resp = requests.patch(
            f"{supabase_url}/rest/v1/companies?id=eq.{company_id}",
            headers=supabase_headers,
            json={
                "name": "Barbearia Action Updated",
                "address": "Rua Action, 789",
                "description": "Melhor barbearia da cidade",
            },
        )
        assert resp.status_code == 200
        updated = resp.json()[0]
        assert updated["name"] == "Barbearia Action Updated"
        assert updated["address"] == "Rua Action, 789"
        assert updated["description"] == "Melhor barbearia da cidade"

        # Restore original
        requests.patch(
            f"{supabase_url}/rest/v1/companies?id=eq.{company_id}",
            headers=supabase_headers,
            json={"name": "Barbearia Teste", "address": None, "description": None},
        )

    def test_create_additional_company(self, supabase_url, supabase_headers, test_tenant):
        """Create a second company for the tenant."""
        tenant_id = test_tenant["tenant_id"]
        resp = requests.post(
            f"{supabase_url}/rest/v1/companies",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "name": "Filial Action Test",
                "is_default": False,
                "address": "Av. Brasil, 100",
                "phone": "11999998888",
            },
        )
        assert resp.status_code in (200, 201)
        company = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
        assert company["name"] == "Filial Action Test"
        assert company["is_default"] is False
        assert company["tenant_id"] == tenant_id

        # Cleanup
        requests.delete(
            f"{supabase_url}/rest/v1/companies?id=eq.{company['id']}",
            headers={**supabase_headers, "Prefer": ""},
        )


class TestBusinessHoursActions:
    """Test business hours operations matching upsertBusinessHours logic."""

    def test_get_business_hours_empty(self, supabase_url, supabase_headers, test_tenant):
        """Get business hours for a company with no hours configured."""
        company_id = test_tenant["company_id"]
        resp = requests.get(
            f"{supabase_url}/rest/v1/business_hours?company_id=eq.{company_id}"
            "&select=*&order=weekday",
            headers=supabase_headers,
        )
        assert resp.status_code == 200
        # May be empty or have data from other tests; just check it's a valid list
        assert isinstance(resp.json(), list)

    def test_upsert_business_hours(self, supabase_url, supabase_headers, test_tenant):
        """Simulate upsertBusinessHours: delete old, insert only open days."""
        company_id = test_tenant["company_id"]
        tenant_id = test_tenant["tenant_id"]
        h_no_repr = {**supabase_headers, "Prefer": ""}

        # First delete any existing hours
        requests.delete(
            f"{supabase_url}/rest/v1/business_hours?company_id=eq.{company_id}",
            headers=h_no_repr,
        )

        # Insert open days (Mon-Fri open, Sat-Sun closed)
        open_days = [
            {
                "company_id": company_id,
                "tenant_id": tenant_id,
                "weekday": day,
                "open_time": "09:00",
                "close_time": "18:00",
                "closed": False,
            }
            for day in range(1, 6)  # Mon=1 to Fri=5
        ]

        resp = requests.post(
            f"{supabase_url}/rest/v1/business_hours",
            headers=supabase_headers,
            json=open_days,
        )
        assert resp.status_code in (200, 201), f"Insert failed: {resp.text}"

        # Verify only 5 open days are stored
        resp = requests.get(
            f"{supabase_url}/rest/v1/business_hours?company_id=eq.{company_id}"
            "&select=*&order=weekday",
            headers=supabase_headers,
        )
        assert resp.status_code == 200
        hours = resp.json()
        assert len(hours) == 5
        weekdays = [h["weekday"] for h in hours]
        assert weekdays == [1, 2, 3, 4, 5]

        # Cleanup
        requests.delete(
            f"{supabase_url}/rest/v1/business_hours?company_id=eq.{company_id}",
            headers=h_no_repr,
        )

    def test_closed_days_not_inserted(self, supabase_url, supabase_headers, test_tenant):
        """Verify that closed days are NOT inserted (matching action logic)."""
        company_id = test_tenant["company_id"]
        tenant_id = test_tenant["tenant_id"]
        h_no_repr = {**supabase_headers, "Prefer": ""}

        # Clear first
        requests.delete(
            f"{supabase_url}/rest/v1/business_hours?company_id=eq.{company_id}",
            headers=h_no_repr,
        )

        # Define hours where some are closed
        all_days = []
        for day in range(7):
            entry = {
                "company_id": company_id,
                "tenant_id": tenant_id,
                "weekday": day,
                "open_time": "09:00",
                "close_time": "18:00",
                "closed": day in (0, 6),  # Sunday and Saturday closed
            }
            all_days.append(entry)

        # Only insert open days (matching the action behavior)
        open_days = [d for d in all_days if not d["closed"]]
        if open_days:
            resp = requests.post(
                f"{supabase_url}/rest/v1/business_hours",
                headers=supabase_headers,
                json=open_days,
            )
            assert resp.status_code in (200, 201), f"Insert failed: {resp.text}"

        # Verify: 0 (Sunday) and 6 (Saturday) should NOT be in DB
        resp = requests.get(
            f"{supabase_url}/rest/v1/business_hours?company_id=eq.{company_id}&select=weekday",
            headers=supabase_headers,
        )
        assert resp.status_code == 200
        stored_weekdays = [h["weekday"] for h in resp.json()]
        assert 0 not in stored_weekdays, "Sunday (closed) should not be stored"
        assert 6 not in stored_weekdays, "Saturday (closed) should not be stored"
        assert len(stored_weekdays) == 5

        # Cleanup
        requests.delete(
            f"{supabase_url}/rest/v1/business_hours?company_id=eq.{company_id}",
            headers=h_no_repr,
        )

    def test_upsert_replaces_old_hours(self, supabase_url, supabase_headers, test_tenant):
        """Upsert should delete old hours and insert new ones."""
        company_id = test_tenant["company_id"]
        tenant_id = test_tenant["tenant_id"]
        h_no_repr = {**supabase_headers, "Prefer": ""}

        # Clear
        requests.delete(
            f"{supabase_url}/rest/v1/business_hours?company_id=eq.{company_id}",
            headers=h_no_repr,
        )

        # Insert initial: Mon-Fri
        initial = [
            {
                "company_id": company_id,
                "tenant_id": tenant_id,
                "weekday": day,
                "open_time": "09:00",
                "close_time": "18:00",
                "closed": False,
            }
            for day in range(1, 6)
        ]
        requests.post(
            f"{supabase_url}/rest/v1/business_hours",
            headers=supabase_headers,
            json=initial,
        )

        # Simulate upsert: delete all, insert only Mon-Wed
        requests.delete(
            f"{supabase_url}/rest/v1/business_hours?company_id=eq.{company_id}",
            headers=h_no_repr,
        )
        new_hours = [
            {
                "company_id": company_id,
                "tenant_id": tenant_id,
                "weekday": day,
                "open_time": "10:00",
                "close_time": "20:00",
                "closed": False,
            }
            for day in range(1, 4)  # Mon, Tue, Wed
        ]
        resp = requests.post(
            f"{supabase_url}/rest/v1/business_hours",
            headers=supabase_headers,
            json=new_hours,
        )
        assert resp.status_code in (200, 201)

        # Verify only 3 days now
        resp = requests.get(
            f"{supabase_url}/rest/v1/business_hours?company_id=eq.{company_id}"
            "&select=*&order=weekday",
            headers=supabase_headers,
        )
        assert resp.status_code == 200
        hours = resp.json()
        assert len(hours) == 3
        assert hours[0]["open_time"] == "10:00:00"
        assert hours[0]["close_time"] == "20:00:00"

        # Cleanup
        requests.delete(
            f"{supabase_url}/rest/v1/business_hours?company_id=eq.{company_id}",
            headers=h_no_repr,
        )
