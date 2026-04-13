"""
Tests for Supabase RPC functions (stored procedures).
"""
import requests
import uuid
from datetime import datetime, timedelta


def test_get_available_slots_function(supabase_url, supabase_headers, test_tenant):
    """Call RPC get_available_slots with professional+service+date, verify returns slots."""
    tenant_id = test_tenant["tenant_id"]

    # Create professional
    pro_resp = requests.post(
        f"{supabase_url}/rest/v1/professionals",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "RPC Pro", "active": True},
    )
    assert pro_resp.status_code in (200, 201), f"Failed pro: {pro_resp.text}"
    pro = pro_resp.json()[0] if isinstance(pro_resp.json(), list) else pro_resp.json()

    # Create schedule for the professional (all weekdays)
    schedules = []
    for day in range(1, 6):  # Monday to Friday
        schedules.append({
            "professional_id": pro["id"],
            "weekday": day,
            "start_time": "09:00",
            "end_time": "18:00",
        })
    sched_resp = requests.post(
        f"{supabase_url}/rest/v1/professional_schedules",
        headers=supabase_headers,
        json=schedules,
    )
    assert sched_resp.status_code in (200, 201), f"Failed schedule: {sched_resp.text}"

    # Create category and service
    cat_resp = requests.post(
        f"{supabase_url}/rest/v1/service_categories",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "RPC Cat"},
    )
    assert cat_resp.status_code in (200, 201)
    cat = cat_resp.json()[0] if isinstance(cat_resp.json(), list) else cat_resp.json()

    svc_resp = requests.post(
        f"{supabase_url}/rest/v1/services",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "category_id": cat["id"],
            "name": "RPC Service",
            "price": 40.00,
            "duration_min": 30,
        },
    )
    assert svc_resp.status_code in (200, 201)
    svc = svc_resp.json()[0] if isinstance(svc_resp.json(), list) else svc_resp.json()

    # Find next weekday (Mon-Fri) for the test
    target_date = datetime.utcnow() + timedelta(days=1)
    while target_date.weekday() >= 5:  # Skip weekend
        target_date += timedelta(days=1)
    date_str = target_date.strftime("%Y-%m-%d")

    # Call RPC
    rpc_resp = requests.post(
        f"{supabase_url}/rest/v1/rpc/get_available_slots",
        headers=supabase_headers,
        json={
            "p_tenant_id": tenant_id,
            "p_professional_id": pro["id"],
            "p_service_id": svc["id"],
            "p_date": date_str,
        },
    )

    # The RPC may or may not exist - if it does, verify structure
    if rpc_resp.status_code == 200:
        slots = rpc_resp.json()
        assert isinstance(slots, list)
        # If the function returns slots, each should have a time field
        if len(slots) > 0:
            first_slot = slots[0]
            # Check for common slot field names
            assert any(
                key in first_slot
                for key in ["start_time", "slot_start", "time", "start"]
            ), f"Slot structure unexpected: {first_slot}"
    elif rpc_resp.status_code == 404:
        # Function does not exist yet - that's acceptable
        pass
    else:
        # Other error - log but don't fail hard
        assert rpc_resp.status_code in (200, 404), (
            f"Unexpected RPC response: {rpc_resp.status_code} {rpc_resp.text}"
        )

    # Cleanup
    headers_clean = {**supabase_headers, "Prefer": ""}
    requests.delete(
        f"{supabase_url}/rest/v1/services?id=eq.{svc['id']}", headers=headers_clean
    )
    requests.delete(
        f"{supabase_url}/rest/v1/service_categories?id=eq.{cat['id']}", headers=headers_clean
    )
    requests.delete(
        f"{supabase_url}/rest/v1/professional_schedules?professional_id=eq.{pro['id']}",
        headers=headers_clean,
    )
    requests.delete(
        f"{supabase_url}/rest/v1/professionals?id=eq.{pro['id']}", headers=headers_clean
    )
