import { createHmac, timingSafeEqual } from "crypto";

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET!;

/** Sign a short-lived admin token (24h). Uses HMAC-SHA256 over base64url-encoded payload. */
export function signAdminToken(email: string): string {
  const payload = JSON.stringify({
    email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400, // 24h
  });
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", ADMIN_JWT_SECRET).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

/** Validate an admin token. Returns { valid, email } or { valid: false }. */
export function validateAdminToken(token: string): { valid: boolean; email?: string } {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return { valid: false };
    const [b64, sig] = parts;

    const expectedSig = createHmac("sha256", ADMIN_JWT_SECRET).update(b64).digest("base64url");
    const sigBuf = Buffer.from(sig, "base64url");
    const expBuf = Buffer.from(expectedSig, "base64url");

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false };
    }

    const payload = JSON.parse(Buffer.from(b64, "base64url").toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return { valid: false };

    return { valid: true, email: payload.email };
  } catch {
    return { valid: false };
  }
}

/** Get admin token from request cookies. */
export function getAdminTokenFromRequest(request: Request): string | null {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)barberflow_admin_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Validate admin token from request. Returns { valid, email }. */
export function validateAdminRequest(request: Request): { valid: boolean; email?: string } {
  const token = getAdminTokenFromRequest(request);
  if (!token) return { valid: false };
  return validateAdminToken(token);
}

/** Sign an impersonation token for a tenant. Expires in 2h. */
export function signImpersonationToken(tenantId: string): string {
  const payload = JSON.stringify({
    tenantId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7200, // 2h
  });
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", ADMIN_JWT_SECRET).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

/** Validate an impersonation token. Returns { valid, tenantId }. */
export function validateImpersonationToken(token: string): { valid: boolean; tenantId?: string } {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return { valid: false };
    const [b64, sig] = parts;

    const expectedSig = createHmac("sha256", ADMIN_JWT_SECRET).update(b64).digest("base64url");
    const sigBuf = Buffer.from(sig, "base64url");
    const expBuf = Buffer.from(expectedSig, "base64url");

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false };
    }

    const payload = JSON.parse(Buffer.from(b64, "base64url").toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return { valid: false };

    return { valid: true, tenantId: payload.tenantId };
  } catch {
    return { valid: false };
  }
}
