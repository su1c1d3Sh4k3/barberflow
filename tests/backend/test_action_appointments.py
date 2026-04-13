"""
Tests for appointment server-action business logic via Supabase REST API.

Mirrors the logic in src/lib/actions/appointments.ts:
- createAppointment (with junction + history + conflict check)
- updateAppointmentStatus (with history logging)
- rescheduleAppointment (with old-state history)
- getAppointments filtered by date
- getDashboardStats
"""
import requests
import uuid
from datetime import datetime, timedelta


# ─── Helpers ────────────────────────────────────────────────────────────────

def _setup_deps(supabase_url, supabase_headers, tenant_id, company_id):
    """Create professional, category, service, contact for appointment tests."""
    unique = uuid.uuid4().hex[:6]

    pro = requests.post(
        f"{supabase_url}/rest/v1/professionals",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "company_id": company_id, "name": f"ActionPro-{unique}", "active": True},
    ).json()
    pro = pro[0] if isinstance(pro, list) else pro

    cat = requests.post(
        f"{supabase_url}/rest/v1/service_categories",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": f"ActionCat-{unique}"},
    ).json()
    cat = cat[0] if isinstance(cat, list) else cat

    svc = requests.post(
        f"{supabase_url}/rest/v1/services",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "category_id": cat["id"],
            "name": f"ActionSvc-{unique}",
            "price": 60.00,
            "duration_min": 30,
        },
    ).json()
    svc = svc[0] if isinstance(svc, list) else svc

    contact = requests.post(
        f"{supabase_url}/rest/v1/contacts",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": f"ActionClient-{unique}", "phone": f"55119{unique}01"},
    ).json()
    contact = contact[0] if isinstance(contact, list) else contact

    return {"professional": pro, "category": cat, "service": svc, "contact": contact}


def _cleanup_deps(supabase_url, supabase_headers, deps):
    h = {**supabase_headers, "Prefer": ""}
    requests.delete(f"{supabase_url}/rest/v1/contacts?id=eq.{deps['contact']['id']}", headers=h)
    requests.delete(f"{supabase_url}/rest/v1/services?id=eq.{deps['service']['id']}", headers=h)
    requests.delete(f"{supabase_url}/rest/v1/service_categories?id=eq.{deps['category']['id']}", headers=h)
    requests.delete(f"{supabase_url}/rest/v1/professionals?id=eq.{deps['professional']['id']}", headers=h)


def _cleanup_appt(supabase_url, supabase_headers, appt_id):
    h = {**supabase_headers, "Prefer": ""}
    requests.delete(f"{supabase_url}/rest/v1/appointment_services?appointment_id=eq.{appt_id}", headers=h)
    requests.delete(f"{supabase_url}/rest/v1/appointment_history?appointment_id=eq.{appt_id}", headers=h)
    requests.delete(f"{supabase_url}/rest/v1/appointments?id=eq.{appt_id}", headers=h)


def _ts(days_offset, hour=10, minute=0):
    """Return ISO timestamp offset from now."""
    dt = (datetime.utcnow() + timedelta(days=days_offset)).replace(
        hour=hour, minute=minute, second=0, microsecond=0
    )
    return dt.isoformat() + "Z"


def _create_full_appointment(supabase_url, supabase_headers, tenant_id, company_id, deps,
                              days_offset=1, hour=10):
    """Simulate createAppointment server action: insert appt + junction + history."""
    start = _ts(days_offset, hour)
    end = _ts(days_offset, hour, 30)

    # Insert appointment
    resp = requests.post(
        f"{supabase_url}/rest/v1/appointments",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "company_id": company_id,
            "professional_id": deps["professional"]["id"],
            "contact_id": deps["contact"]["id"],
            "start_at": start,
            "end_at": end,
            "status": "pendente",
            "total_price": 60.00,
            "created_via": "painel",
        },
    )
    assert resp.status_code in (200, 201), f"Failed to create appointment: {resp.text}"
    appt = resp.json()[0] if isinstance(resp.json(), list) else resp.json()

    # Junction: link service
    requests.post(
        f"{supabase_url}/rest/v1/appointment_services",
        headers=supabase_headers,
        json={
            "appointment_id": appt["id"],
            "service_id": deps["service"]["id"],
            "price_at_time": 60.00,
        },
    )

    # History: log creation
    requests.post(
        f"{supabase_url}/rest/v1/appointment_history",
        headers=supabase_headers,
        json={
            "appointment_id": appt["id"],
            "action": "created",
            "new_state": appt,
            "performed_by": "admin",
        },
    )

    return appt


# ─── Tests ──────────────────────────────────────────────────────────────────

def test_create_appointment_and_verify(supabase_url, supabase_headers, test_tenant):
    """Create appointment and verify it appears in the appointments table."""
    tid = test_tenant["tenant_id"]
    cid = test_tenant["company_id"]
    deps = _setup_deps(supabase_url, supabase_headers, tid, cid)

    appt = _create_full_appointment(supabase_url, supabase_headers, tid, cid, deps)

    # Verify it exists in DB
    check = requests.get(
        f"{supabase_url}/rest/v1/appointments?id=eq.{appt['id']}&select=*",
        headers=supabase_headers,
    )
    assert check.status_code == 200
    data = check.json()
    assert len(data) == 1
    assert data[0]["status"] == "pendente"
    assert data[0]["total_price"] == 60.00

    _cleanup_appt(supabase_url, supabase_headers, appt["id"])
    _cleanup_deps(supabase_url, supabase_headers, deps)


def test_appointment_services_junction_created(supabase_url, supabase_headers, test_tenant):
    """Verify appointment_services junction is created."""
    tid = test_tenant["tenant_id"]
    cid = test_tenant["company_id"]
    deps = _setup_deps(supabase_url, supabase_headers, tid, cid)

    appt = _create_full_appointment(supabase_url, supabase_headers, tid, cid, deps, days_offset=2)

    # Check junction
    junc = requests.get(
        f"{supabase_url}/rest/v1/appointment_services?appointment_id=eq.{appt['id']}&select=*",
        headers=supabase_headers,
    )
    assert junc.status_code == 200
    jdata = junc.json()
    assert len(jdata) == 1
    assert jdata[0]["service_id"] == deps["service"]["id"]
    assert jdata[0]["price_at_time"] == 60.00

    _cleanup_appt(supabase_url, supabase_headers, appt["id"])
    _cleanup_deps(supabase_url, supabase_headers, deps)


def test_appointment_history_logged_on_create(supabase_url, supabase_headers, test_tenant):
    """Verify appointment_history is logged on create."""
    tid = test_tenant["tenant_id"]
    cid = test_tenant["company_id"]
    deps = _setup_deps(supabase_url, supabase_headers, tid, cid)

    appt = _create_full_appointment(supabase_url, supabase_headers, tid, cid, deps, days_offset=3)

    hist = requests.get(
        f"{supabase_url}/rest/v1/appointment_history?appointment_id=eq.{appt['id']}&select=*",
        headers=supabase_headers,
    )
    assert hist.status_code == 200
    hdata = hist.json()
    assert len(hdata) >= 1
    created_entry = [h for h in hdata if h["action"] == "created"]
    assert len(created_entry) == 1
    assert created_entry[0]["performed_by"] == "admin"

    _cleanup_appt(supabase_url, supabase_headers, appt["id"])
    _cleanup_deps(supabase_url, supabase_headers, deps)


def test_conflict_detection(supabase_url, supabase_headers, test_tenant):
    """Conflict detection: two appointments same professional same time.

    The server action checks for overlapping appointments before inserting.
    We simulate this by querying for conflicts before inserting the second one.
    """
    tid = test_tenant["tenant_id"]
    cid = test_tenant["company_id"]
    deps = _setup_deps(supabase_url, supabase_headers, tid, cid)

    start = _ts(5, 15)
    end = _ts(5, 15, 30)

    # First appointment
    appt1 = _create_full_appointment(supabase_url, supabase_headers, tid, cid, deps, days_offset=5, hour=15)

    # Check for conflicts (mirrors server action logic)
    conflicts = requests.get(
        f"{supabase_url}/rest/v1/appointments"
        f"?professional_id=eq.{deps['professional']['id']}"
        f"&status=in.(pendente,confirmado)"
        f"&start_at=lt.{end}"
        f"&end_at=gt.{start}"
        f"&select=id",
        headers=supabase_headers,
    )
    assert conflicts.status_code == 200
    assert len(conflicts.json()) >= 1, "Expected at least one conflict"

    _cleanup_appt(supabase_url, supabase_headers, appt1["id"])
    _cleanup_deps(supabase_url, supabase_headers, deps)


def test_update_status_with_history(supabase_url, supabase_headers, test_tenant):
    """Update appointment status and verify history is logged."""
    tid = test_tenant["tenant_id"]
    cid = test_tenant["company_id"]
    deps = _setup_deps(supabase_url, supabase_headers, tid, cid)

    appt = _create_full_appointment(supabase_url, supabase_headers, tid, cid, deps, days_offset=6)

    # Fetch current state
    curr = requests.get(
        f"{supabase_url}/rest/v1/appointments?id=eq.{appt['id']}&select=*",
        headers=supabase_headers,
    ).json()[0]

    # Update status to confirmado
    patch = requests.patch(
        f"{supabase_url}/rest/v1/appointments?id=eq.{appt['id']}",
        headers=supabase_headers,
        json={"status": "confirmado"},
    )
    assert patch.status_code == 200
    assert patch.json()[0]["status"] == "confirmado"

    # Log history (mirrors updateAppointmentStatus action)
    hist_resp = requests.post(
        f"{supabase_url}/rest/v1/appointment_history",
        headers=supabase_headers,
        json={
            "appointment_id": appt["id"],
            "action": "confirmed",
            "previous_state": {"status": curr["status"]},
            "new_state": {"status": "confirmado"},
            "performed_by": "admin",
        },
    )
    assert hist_resp.status_code in (200, 201)

    # Verify history has both entries (created + confirmed)
    hist = requests.get(
        f"{supabase_url}/rest/v1/appointment_history?appointment_id=eq.{appt['id']}&select=*&order=created_at",
        headers=supabase_headers,
    )
    actions = [h["action"] for h in hist.json()]
    assert "created" in actions
    assert "confirmed" in actions

    _cleanup_appt(supabase_url, supabase_headers, appt["id"])
    _cleanup_deps(supabase_url, supabase_headers, deps)


def test_reschedule_with_history(supabase_url, supabase_headers, test_tenant):
    """Reschedule appointment to new time and verify old state is logged."""
    tid = test_tenant["tenant_id"]
    cid = test_tenant["company_id"]
    deps = _setup_deps(supabase_url, supabase_headers, tid, cid)

    appt = _create_full_appointment(supabase_url, supabase_headers, tid, cid, deps, days_offset=7, hour=9)

    # Fetch current state
    curr = requests.get(
        f"{supabase_url}/rest/v1/appointments?id=eq.{appt['id']}&select=*",
        headers=supabase_headers,
    ).json()[0]
    old_start = curr["start_at"]

    # Reschedule
    new_start = _ts(8, 14)
    new_end = _ts(8, 14, 30)

    patch = requests.patch(
        f"{supabase_url}/rest/v1/appointments?id=eq.{appt['id']}",
        headers=supabase_headers,
        json={"start_at": new_start, "end_at": new_end},
    )
    assert patch.status_code == 200

    # Log history (mirrors rescheduleAppointment action)
    hist_resp = requests.post(
        f"{supabase_url}/rest/v1/appointment_history",
        headers=supabase_headers,
        json={
            "appointment_id": appt["id"],
            "action": "rescheduled",
            "previous_state": {"start_at": old_start, "end_at": curr["end_at"]},
            "new_state": {"start_at": new_start, "end_at": new_end},
            "performed_by": "admin",
        },
    )
    assert hist_resp.status_code in (200, 201)

    # Verify rescheduled history entry exists
    hist = requests.get(
        f"{supabase_url}/rest/v1/appointment_history?appointment_id=eq.{appt['id']}&action=eq.rescheduled&select=*",
        headers=supabase_headers,
    )
    assert len(hist.json()) == 1
    assert hist.json()[0]["previous_state"]["start_at"] == old_start

    _cleanup_appt(supabase_url, supabase_headers, appt["id"])
    _cleanup_deps(supabase_url, supabase_headers, deps)


def test_get_appointments_filtered_by_date(supabase_url, supabase_headers, test_tenant):
    """Get appointments filtered by date (mirrors getAppointments action)."""
    tid = test_tenant["tenant_id"]
    cid = test_tenant["company_id"]
    deps = _setup_deps(supabase_url, supabase_headers, tid, cid)

    # Create appointment for a specific day
    target_day = 20
    appt = _create_full_appointment(supabase_url, supabase_headers, tid, cid, deps, days_offset=target_day, hour=11)

    # Build date string for filtering
    target_date = (datetime.utcnow() + timedelta(days=target_day)).strftime("%Y-%m-%d")

    # Query appointments for that date (mirrors getAppointments)
    resp = requests.get(
        f"{supabase_url}/rest/v1/appointments"
        f"?tenant_id=eq.{tid}"
        f"&start_at=gte.{target_date}T00:00:00"
        f"&start_at=lt.{target_date}T23:59:59"
        f"&status=neq.cancelado"
        f"&select=*,contacts(id,name,phone),professionals(id,name)"
        f"&order=start_at",
        headers=supabase_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    found = [a for a in data if a["id"] == appt["id"]]
    assert len(found) == 1

    _cleanup_appt(supabase_url, supabase_headers, appt["id"])
    _cleanup_deps(supabase_url, supabase_headers, deps)


def test_dashboard_stats(supabase_url, supabase_headers, test_tenant):
    """Get dashboard stats: contacts count, appointments by status, revenue."""
    tid = test_tenant["tenant_id"]
    cid = test_tenant["company_id"]
    deps = _setup_deps(supabase_url, supabase_headers, tid, cid)

    target_day = 25
    target_date = (datetime.utcnow() + timedelta(days=target_day)).strftime("%Y-%m-%d")
    date_from = f"{target_date}T00:00:00"
    date_to = f"{target_date}T23:59:59"

    # Create 2 appointments: one pendente, one confirmado with price
    appt1 = _create_full_appointment(supabase_url, supabase_headers, tid, cid, deps, days_offset=target_day, hour=10)
    appt2 = _create_full_appointment(supabase_url, supabase_headers, tid, cid, deps, days_offset=target_day, hour=11)

    # Confirm appt2
    requests.patch(
        f"{supabase_url}/rest/v1/appointments?id=eq.{appt2['id']}",
        headers=supabase_headers,
        json={"status": "confirmado"},
    )

    # Query appointments in date range (mirrors getDashboardStats)
    appts_resp = requests.get(
        f"{supabase_url}/rest/v1/appointments"
        f"?tenant_id=eq.{tid}"
        f"&start_at=gte.{date_from}"
        f"&start_at=lte.{date_to}"
        f"&select=id,status,total_price,professional_id,start_at",
        headers=supabase_headers,
    )
    assert appts_resp.status_code == 200
    appts = appts_resp.json()
    assert len(appts) >= 2

    # Count contacts
    contacts_resp = requests.get(
        f"{supabase_url}/rest/v1/contacts?tenant_id=eq.{tid}&select=id",
        headers={**supabase_headers, "Prefer": "count=exact"},
    )
    assert contacts_resp.status_code == 200

    # Compute stats
    confirmed = [a for a in appts if a["status"] == "confirmado"]
    revenue = sum(a.get("total_price", 0) or 0 for a in appts if a["status"] in ("confirmado", "concluido"))

    assert len(confirmed) >= 1
    assert revenue >= 60.00  # at least appt2's price

    _cleanup_appt(supabase_url, supabase_headers, appt1["id"])
    _cleanup_appt(supabase_url, supabase_headers, appt2["id"])
    _cleanup_deps(supabase_url, supabase_headers, deps)
