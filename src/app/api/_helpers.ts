import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ZodSchema } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export function getTenantId(request: NextRequest): string | null {
  return request.headers.get("x-tenant-id");
}

export function validateAuth(request: NextRequest): { tenantId: string } | NextResponse {
  const authHeader = request.headers.get("authorization");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!authHeader || !authHeader.includes(serviceRoleKey || "")) {
    return apiError("Unauthorized", 401);
  }

  const tenantId = getTenantId(request);
  if (!tenantId) return apiError("Missing x-tenant-id header", 400);

  return { tenantId };
}

export function isAuthError(auth: ReturnType<typeof validateAuth>): auth is NextResponse {
  return auth instanceof NextResponse;
}

export function db() {
  return createServiceRoleClient();
}

export function validateBody<T>(schema: ZodSchema<T>, body: unknown): { data: T } | NextResponse {
  const result = schema.safeParse(body);
  if (!result.success) {
    const messages = result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    return apiError(`Validation error: ${messages}`, 422);
  }
  return { data: result.data };
}

export function isValidationError<T>(v: { data: T } | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}

/** Build the webhook URL for uazapi. Always uses the public production URL. */
export function getWebhookUrl(): string {
  const base = "https://clinvia-barber.d69qzb.easypanel.host";
  const token = process.env.WHATSAPP_WEBHOOK_TOKEN;
  return token
    ? `${base}/api/webhooks/whatsapp?token=${token}`
    : `${base}/api/webhooks/whatsapp`;
}

export function applyRateLimit(request: NextRequest, tenantId: string): NextResponse | null {
  const result = checkRateLimit(`tenant:${tenantId}`, 300, 60_000);
  if (!result.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
          "X-RateLimit-Remaining": String(result.remaining),
        },
      }
    );
  }
  return null;
}
