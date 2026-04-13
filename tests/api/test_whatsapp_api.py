"""
API tests for the WhatsApp routes (/api/whatsapp/*).
"""
import requests
import pytest


def test_whatsapp_connect_requires_auth(app_url):
    """POST /api/whatsapp/connect without auth should return 401 or 400."""
    resp = requests.post(f"{app_url}/api/whatsapp/connect")
    assert resp.status_code in (401, 400), (
        f"Expected 401/400 without auth, got: {resp.status_code}"
    )


def test_whatsapp_status_requires_auth(app_url):
    """GET /api/whatsapp/status without auth should return 401 or 400."""
    resp = requests.get(f"{app_url}/api/whatsapp/status")
    assert resp.status_code in (401, 400), (
        f"Expected 401/400 without auth, got: {resp.status_code}"
    )


def test_whatsapp_connect_with_auth(app_url, api_headers, test_tenant):
    """POST /api/whatsapp/connect with proper headers should not return 500."""
    headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
    resp = requests.post(f"{app_url}/api/whatsapp/connect", headers=headers)
    # May fail if uazapi is not reachable, but should not be a server error
    assert resp.status_code != 500, (
        f"Server error on whatsapp connect: {resp.text}"
    )


def test_whatsapp_status_with_auth(app_url, api_headers, test_tenant):
    """GET /api/whatsapp/status with proper headers should return 200 or 404."""
    headers = {**api_headers, "x-tenant-id": test_tenant["tenant_id"]}
    resp = requests.get(f"{app_url}/api/whatsapp/status", headers=headers)
    assert resp.status_code in (200, 404), (
        f"Expected 200 or 404, got: {resp.status_code} - {resp.text}"
    )
