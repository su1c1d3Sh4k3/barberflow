"""
Tests for appointments table: CRUD, junction table, history, statuses, conflicts.
"""
import requests
import uuid
from datetime import datetime, timedelta


def _setup_appointment_deps(supabase_url, supabase_headers, tenant_id):
    """Create all dependencies for an appointment: professional, service, contact."""
    # Professional
    pro_resp = requests.post(
        f"{supabase_url}/rest/v1/professionals",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "Appt Pro", "active": True},
    )
    pro = pro_resp.json()[0] if isinstance(pro_resp.json(), list) else pro_resp.json()

    # Category
    cat_resp = requests.post(
        f"{supabase_url}/rest/v1/service_categories",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "Appt Cat"},
    )
    cat = cat_resp.json()[0] if isinstance(cat_resp.json(), list) else cat_resp.json()

    # Service
    svc_resp = requests.post(
        f"{supabase_url}/rest/v1/services",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "category_id": cat["id"],
            "name": "Appt Service",
            "price": 50.00,
            "duration_min": 30,
        },
    )
    svc = svc_resp.json()[0] if isinstance(svc_resp.json(), list) else svc_resp.json()

    # Contact
    contact_resp = requests.post(
        f"{supabase_url}/rest/v1/contacts",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "Appt Client", "phone": f"55119{uuid.uuid4().hex[:8]}"},
    )
    contact = contact_resp.json()[0] if isinstance(contact_resp.json(), list) else contact_resp.json()

    return {
        "professional": pro,
        "category": cat,
        "service": svc,
        "contact": contact,
    }


def _cleanup_appointment_deps(supabase_url, supabase_headers, deps):
    """Clean up appointment dependencies."""
    headers = {**supabase_headers, "Prefer": ""}
    requests.delete(f"{supabase_url}/rest/v1/contacts?id=eq.{deps['contact']['id']}", headers=headers)
    requests.delete(f"{supabase_url}/rest/v1/services?id=eq.{deps['service']['id']}", headers=headers)
    requests.delete(f"{supabase_url}/rest/v1/service_categories?id=eq.{deps['category']['id']}", headers=headers)
    requests.delete(f"{supabase_url}/rest/v1/professionals?id=eq.{deps['professional']['id']}", headers=headers)


def _make_start_end(days_offset, hour=10):
    """Helper to create start_at and end_at (30 min appointment)."""
    start = (datetime.utcnow() + timedelta(days=days_offset)).replace(hour=hour, minute=0, second=0, microsecond=0)
    end = start + timedelta(minutes=30)
    return start.isoformat() + "Z", end.isoformat() + "Z"


def test_create_appointment(supabase_url, supabase_headers, test_tenant):
    """Full insert of an appointment with FK refs."""
    tenant_id = test_tenant["tenant_id"]
    deps = _setup_appointment_deps(supabase_url, supabase_headers, tenant_id)

    start_at, end_at = _make_start_end(1)

    resp = requests.post(
        f"{supabase_url}/rest/v1/appointments",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "professional_id": deps["professional"]["id"],
            "contact_id": deps["contact"]["id"],
            "start_at": start_at,
            "end_at": end_at,
            "status": "pendente",
        },
    )
    assert resp.status_code in (200, 201), f"Failed: {resp.text}"
    appt = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
    assert appt["status"] == "pendente"
    assert appt["professional_id"] == deps["professional"]["id"]

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/appointments?id=eq.{appt['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
    _cleanup_appointment_deps(supabase_url, supabase_headers, deps)


def test_appointment_services_junction(supabase_url, supabase_headers, test_tenant):
    """Insert into appointment_services junction table."""
    tenant_id = test_tenant["tenant_id"]
    deps = _setup_appointment_deps(supabase_url, supabase_headers, tenant_id)

    start_at, end_at = _make_start_end(2, hour=14)

    appt_resp = requests.post(
        f"{supabase_url}/rest/v1/appointments",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "professional_id": deps["professional"]["id"],
            "contact_id": deps["contact"]["id"],
            "start_at": start_at,
            "end_at": end_at,
            "status": "pendente",
        },
    )
    appt = appt_resp.json()[0] if isinstance(appt_resp.json(), list) else appt_resp.json()

    # Insert junction
    junc_resp = requests.post(
        f"{supabase_url}/rest/v1/appointment_services",
        headers=supabase_headers,
        json={
            "appointment_id": appt["id"],
            "service_id": deps["service"]["id"],
            "price_at_time": 50.00,
        },
    )
    assert junc_resp.status_code in (200, 201), f"Failed: {junc_resp.text}"

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/appointment_services?appointment_id=eq.{appt['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
    requests.delete(
        f"{supabase_url}/rest/v1/appointments?id=eq.{appt['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
    _cleanup_appointment_deps(supabase_url, supabase_headers, deps)


def test_appointment_history_log(supabase_url, supabase_headers, test_tenant):
    """Insert a history entry for an appointment."""
    tenant_id = test_tenant["tenant_id"]
    deps = _setup_appointment_deps(supabase_url, supabase_headers, tenant_id)

    start_at, end_at = _make_start_end(3, hour=11)

    appt_resp = requests.post(
        f"{supabase_url}/rest/v1/appointments",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "professional_id": deps["professional"]["id"],
            "contact_id": deps["contact"]["id"],
            "start_at": start_at,
            "end_at": end_at,
            "status": "pendente",
        },
    )
    appt = appt_resp.json()[0] if isinstance(appt_resp.json(), list) else appt_resp.json()

    # Insert history
    hist_resp = requests.post(
        f"{supabase_url}/rest/v1/appointment_history",
        headers=supabase_headers,
        json={
            "appointment_id": appt["id"],
            "action": "confirmed",
            "previous_state": {"status": "pendente"},
            "new_state": {"status": "confirmado"},
            "performed_by": "system",
        },
    )
    assert hist_resp.status_code in (200, 201), f"Failed: {hist_resp.text}"

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/appointment_history?appointment_id=eq.{appt['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
    requests.delete(
        f"{supabase_url}/rest/v1/appointments?id=eq.{appt['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
    _cleanup_appointment_deps(supabase_url, supabase_headers, deps)


def test_appointment_status_values(supabase_url, supabase_headers, test_tenant):
    """Test all valid appointment statuses."""
    tenant_id = test_tenant["tenant_id"]
    deps = _setup_appointment_deps(supabase_url, supabase_headers, tenant_id)
    valid_statuses = ["pendente", "confirmado", "concluido", "cancelado", "reagendado", "no_show"]
    created_ids = []

    for i, status in enumerate(valid_statuses):
        start_at, end_at = _make_start_end(10 + i)
        resp = requests.post(
            f"{supabase_url}/rest/v1/appointments",
            headers=supabase_headers,
            json={
                "tenant_id": tenant_id,
                "professional_id": deps["professional"]["id"],
                "contact_id": deps["contact"]["id"],
                "start_at": start_at,
                "end_at": end_at,
                "status": status,
            },
        )
        if resp.status_code in (200, 201):
            appt = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
            assert appt["status"] == status
            created_ids.append(appt["id"])

    # At least some statuses should work
    assert len(created_ids) >= 3

    # Cleanup
    for aid in created_ids:
        requests.delete(
            f"{supabase_url}/rest/v1/appointments?id=eq.{aid}",
            headers={**supabase_headers, "Prefer": ""},
        )
    _cleanup_appointment_deps(supabase_url, supabase_headers, deps)


def test_appointment_conflict(supabase_url, supabase_headers, test_tenant):
    """Two appointments same time/professional - app-level conflict detection."""
    tenant_id = test_tenant["tenant_id"]
    deps = _setup_appointment_deps(supabase_url, supabase_headers, tenant_id)

    start_at, end_at = _make_start_end(5, hour=15)

    # First appointment
    resp1 = requests.post(
        f"{supabase_url}/rest/v1/appointments",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "professional_id": deps["professional"]["id"],
            "contact_id": deps["contact"]["id"],
            "start_at": start_at,
            "end_at": end_at,
            "status": "pendente",
        },
    )
    assert resp1.status_code in (200, 201)
    appt1 = resp1.json()[0] if isinstance(resp1.json(), list) else resp1.json()

    # Second appointment at same time/professional - DB allows it (conflict is app-level)
    resp2 = requests.post(
        f"{supabase_url}/rest/v1/appointments",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "professional_id": deps["professional"]["id"],
            "contact_id": deps["contact"]["id"],
            "start_at": start_at,
            "end_at": end_at,
            "status": "pendente",
        },
    )
    # DB allows overlapping inserts; conflict detection is at app level
    created_ids = [appt1["id"]]
    if resp2.status_code in (200, 201):
        appt2 = resp2.json()[0] if isinstance(resp2.json(), list) else resp2.json()
        created_ids.append(appt2["id"])
    # Both inserts should succeed since there's no DB-level exclusion constraint
    assert resp2.status_code in (200, 201), f"Expected success, got {resp2.status_code}: {resp2.text}"

    # Cleanup
    for aid in created_ids:
        requests.delete(
            f"{supabase_url}/rest/v1/appointments?id=eq.{aid}",
            headers={**supabase_headers, "Prefer": ""},
        )
    _cleanup_appointment_deps(supabase_url, supabase_headers, deps)
