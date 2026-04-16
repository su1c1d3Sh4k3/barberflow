"""
Tests for messages, conversation_states, and whatsapp_sessions tables.
"""
import requests
import uuid


def test_log_message(supabase_url, supabase_headers, test_tenant):
    """Insert inbound and outbound messages."""
    tenant_id = test_tenant["tenant_id"]

    # Create a contact first
    contact_resp = requests.post(
        f"{supabase_url}/rest/v1/contacts",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "Msg Client", "phone": "5511900110022"},
    )
    assert contact_resp.status_code in (200, 201)
    contact = contact_resp.json()[0] if isinstance(contact_resp.json(), list) else contact_resp.json()

    # Inbound message
    inbound_resp = requests.post(
        f"{supabase_url}/rest/v1/messages",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "contact_id": contact["id"],
            "direction": "in",
            "content": "Quero agendar um horário",
            "sent_by": "human",
        },
    )
    assert inbound_resp.status_code in (200, 201), f"Failed: {inbound_resp.text}"
    inbound = inbound_resp.json()[0] if isinstance(inbound_resp.json(), list) else inbound_resp.json()
    assert inbound["direction"] == "in"

    # Outbound message
    outbound_resp = requests.post(
        f"{supabase_url}/rest/v1/messages",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "contact_id": contact["id"],
            "direction": "out",
            "content": "Claro! Para quando?",
            "sent_by": "ia",
        },
    )
    assert outbound_resp.status_code in (200, 201), f"Failed: {outbound_resp.text}"
    outbound = outbound_resp.json()[0] if isinstance(outbound_resp.json(), list) else outbound_resp.json()
    assert outbound["direction"] == "out"

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/messages?contact_id=eq.{contact['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
    requests.delete(
        f"{supabase_url}/rest/v1/contacts?id=eq.{contact['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_conversation_state(supabase_url, supabase_headers, test_tenant):
    """Create and update a conversation state."""
    tenant_id = test_tenant["tenant_id"]

    # Create contact
    contact_resp = requests.post(
        f"{supabase_url}/rest/v1/contacts",
        headers=supabase_headers,
        json={"tenant_id": tenant_id, "name": "Conv Client", "phone": "5511900220033"},
    )
    assert contact_resp.status_code in (200, 201)
    contact = contact_resp.json()[0] if isinstance(contact_resp.json(), list) else contact_resp.json()

    # Create conversation state
    state_resp = requests.post(
        f"{supabase_url}/rest/v1/conversation_states",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "contact_id": contact["id"],
            "current_state": "greeting",
            "context": {"intent": "scheduling"},
        },
    )
    assert state_resp.status_code in (200, 201), f"Failed: {state_resp.text}"
    state = state_resp.json()[0] if isinstance(state_resp.json(), list) else state_resp.json()
    assert state["current_state"] == "greeting"

    # Update state
    patch_resp = requests.patch(
        f"{supabase_url}/rest/v1/conversation_states?id=eq.{state['id']}",
        headers=supabase_headers,
        json={"current_state": "collecting_service", "context": {"intent": "scheduling", "step": 2}},
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()[0]
    assert updated["current_state"] == "collecting_service"

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/conversation_states?id=eq.{state['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
    requests.delete(
        f"{supabase_url}/rest/v1/contacts?id=eq.{contact['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )


def test_whatsapp_session(supabase_url, supabase_headers, test_tenant):
    """Create a WhatsApp session record."""
    tenant_id = test_tenant["tenant_id"]

    # Delete any existing session (UNIQUE tenant_id constraint)
    requests.delete(
        f"{supabase_url}/rest/v1/whatsapp_sessions?tenant_id=eq.{tenant_id}",
        headers={**supabase_headers, "Prefer": ""},
    )
    resp = requests.post(
        f"{supabase_url}/rest/v1/whatsapp_sessions",
        headers=supabase_headers,
        json={
            "tenant_id": tenant_id,
            "instance_id": f"test-instance-{uuid.uuid4().hex[:8]}",
            "status": "connected",
            "phone_number": "5511900000001",
        },
    )
    assert resp.status_code in (200, 201), f"Failed: {resp.text}"
    session = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
    assert session["status"] == "connected"
    assert session["tenant_id"] == tenant_id

    # Cleanup
    requests.delete(
        f"{supabase_url}/rest/v1/whatsapp_sessions?id=eq.{session['id']}",
        headers={**supabase_headers, "Prefer": ""},
    )
