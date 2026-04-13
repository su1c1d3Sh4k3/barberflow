"""
Tests for /api/upload endpoint (image upload to Supabase Storage).
"""
import os
import io
import requests
import pytest
import uuid
from dotenv import load_dotenv

_env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env.local")
load_dotenv(_env_path)


class TestUploadAuth:
    """Upload endpoint requires authentication."""

    def test_upload_requires_auth(self, app_url):
        """POST /api/upload without auth → 401."""
        dummy = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
        resp = requests.post(
            f"{app_url}/api/upload",
            files={"file": ("test.png", dummy, "image/png")},
            data={"category": "logos"},
        )
        assert resp.status_code == 401

    def test_upload_requires_tenant_id(self, app_url, api_headers):
        """POST /api/upload without x-tenant-id → 400."""
        dummy = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
        resp = requests.post(
            f"{app_url}/api/upload",
            headers={k: v for k, v in api_headers.items() if k != "Content-Type"},
            files={"file": ("test.png", dummy, "image/png")},
            data={"category": "logos"},
        )
        assert resp.status_code == 400


class TestUploadValidation:
    """Upload endpoint validates file type and size."""

    def _headers(self, api_headers, test_tenant):
        h = {k: v for k, v in api_headers.items() if k != "Content-Type"}
        h["x-tenant-id"] = test_tenant["tenant_id"]
        return h

    def test_rejects_no_file(self, app_url, api_headers, test_tenant):
        """POST /api/upload without file → 400."""
        resp = requests.post(
            f"{app_url}/api/upload",
            headers=self._headers(api_headers, test_tenant),
            data={"category": "logos"},
        )
        assert resp.status_code == 400
        assert "arquivo" in resp.json().get("error", "").lower() or "file" in resp.json().get("error", "").lower()

    def test_rejects_invalid_type(self, app_url, api_headers, test_tenant):
        """POST /api/upload with .txt file → 422."""
        dummy = io.BytesIO(b"Hello, World!")
        resp = requests.post(
            f"{app_url}/api/upload",
            headers=self._headers(api_headers, test_tenant),
            files={"file": ("test.txt", dummy, "text/plain")},
            data={"category": "logos"},
        )
        assert resp.status_code == 422
        assert "tipo" in resp.json().get("error", "").lower() or "permitido" in resp.json().get("error", "").lower()

    def test_rejects_oversized_file(self, app_url, api_headers, test_tenant):
        """POST /api/upload with >2MB file → 422."""
        # Create 2.1MB file
        big = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * (2 * 1024 * 1024 + 100))
        resp = requests.post(
            f"{app_url}/api/upload",
            headers=self._headers(api_headers, test_tenant),
            files={"file": ("big.png", big, "image/png")},
            data={"category": "logos"},
        )
        assert resp.status_code == 422
        assert "grande" in resp.json().get("error", "").lower() or "2mb" in resp.json().get("error", "").lower()


class TestUploadSuccess:
    """Upload endpoint successfully uploads and returns URL."""

    def _headers(self, api_headers, test_tenant):
        h = {k: v for k, v in api_headers.items() if k != "Content-Type"}
        h["x-tenant-id"] = test_tenant["tenant_id"]
        return h

    def _make_png(self, width=1, height=1):
        """Create a minimal valid PNG."""
        import struct
        import zlib

        def chunk(chunk_type, data):
            c = chunk_type + data
            return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

        raw_data = b"\x00" + b"\x00" * (width * 3) * height
        return (
            b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw_data))
            + chunk(b"IEND", b"")
        )

    def test_upload_png_logo(self, app_url, api_headers, test_tenant):
        """Upload a valid PNG → 200 with public URL."""
        png_bytes = self._make_png(10, 10)
        resp = requests.post(
            f"{app_url}/api/upload",
            headers=self._headers(api_headers, test_tenant),
            files={"file": ("logo.png", io.BytesIO(png_bytes), "image/png")},
            data={"category": "logos"},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["success"] is True
        assert "url" in data["data"]
        assert "uploads" in data["data"]["url"]
        assert test_tenant["tenant_id"] in data["data"]["path"]
        assert "logos" in data["data"]["path"]

    def test_upload_jpeg_avatar(self, app_url, api_headers, test_tenant):
        """Upload a valid JPEG → 200 with public URL."""
        # Minimal JPEG
        jpeg_bytes = (
            b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
            + b"\xff\xd9"
        )
        resp = requests.post(
            f"{app_url}/api/upload",
            headers=self._headers(api_headers, test_tenant),
            files={"file": ("avatar.jpg", io.BytesIO(jpeg_bytes), "image/jpeg")},
            data={"category": "avatars"},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["success"] is True
        assert "avatars" in data["data"]["path"]

    def test_upload_webp(self, app_url, api_headers, test_tenant):
        """Upload a WebP → 200."""
        # Minimal WebP
        webp_bytes = b"RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x000\x01\x00\x9d\x01\x2a\x01\x00\x01\x00\x01\x40\x25\xa4\x00\x03\x70\x00\xfe\xfb\x94\x00\x00"
        resp = requests.post(
            f"{app_url}/api/upload",
            headers=self._headers(api_headers, test_tenant),
            files={"file": ("photo.webp", io.BytesIO(webp_bytes), "image/webp")},
            data={"category": "general"},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_uploaded_url_is_accessible(self, app_url, api_headers, test_tenant):
        """Uploaded file should be publicly accessible via its URL."""
        png_bytes = self._make_png(2, 2)
        upload_resp = requests.post(
            f"{app_url}/api/upload",
            headers=self._headers(api_headers, test_tenant),
            files={"file": ("access_test.png", io.BytesIO(png_bytes), "image/png")},
            data={"category": "logos"},
        )
        assert upload_resp.status_code == 200

        public_url = upload_resp.json()["data"]["url"]
        get_resp = requests.get(public_url, timeout=10)
        assert get_resp.status_code == 200, f"Uploaded file not accessible at {public_url}: {get_resp.status_code}"
        assert "image" in get_resp.headers.get("content-type", "")

    def test_default_category(self, app_url, api_headers, test_tenant):
        """Upload without category → defaults to 'general'."""
        png_bytes = self._make_png(1, 1)
        resp = requests.post(
            f"{app_url}/api/upload",
            headers=self._headers(api_headers, test_tenant),
            files={"file": ("no_cat.png", io.BytesIO(png_bytes), "image/png")},
        )
        assert resp.status_code == 200
        assert "general" in resp.json()["data"]["path"]
