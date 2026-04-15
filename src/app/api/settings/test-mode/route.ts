import { NextRequest } from "next/server";
import { ok, apiError } from "@/app/api/_helpers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getTenantFromSession } from "@/lib/supabase/api-auth";

async function resolveTenantId(request: NextRequest): Promise<string | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const authHeader = request.headers.get("authorization") || "";
  if (serviceKey && authHeader.includes(serviceKey)) {
    return request.headers.get("x-tenant-id");
  }
  return getTenantFromSession(request);
}

// GET — return current test mode settings
export async function GET(request: NextRequest) {
  const tenantId = await resolveTenantId(request);
  if (!tenantId) return apiError("Não autenticado", 401);

  const supabase = createServiceRoleClient();
  const [settingsRes, sessionRes] = await Promise.all([
    supabase
      .from("settings")
      .select("test_mode, test_numbers")
      .eq("tenant_id", tenantId)
      .single(),
    supabase
      .from("whatsapp_sessions")
      .select("status")
      .eq("tenant_id", tenantId)
      .single(),
  ]);

  return ok({
    test_mode: settingsRes.data?.test_mode ?? false,
    test_numbers: settingsRes.data?.test_numbers ?? [],
    has_connected_session: sessionRes.data?.status === "connected",
  });
}

// PUT — update test mode settings
// Body: { test_mode?: boolean, test_numbers?: string[] }
export async function PUT(request: NextRequest) {
  const tenantId = await resolveTenantId(request);
  if (!tenantId) return apiError("Não autenticado", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const { test_mode, test_numbers } = body as Record<string, unknown>;

  if (test_mode !== undefined && typeof test_mode !== "boolean") {
    return apiError("test_mode must be a boolean", 400);
  }
  if (test_numbers !== undefined && !Array.isArray(test_numbers)) {
    return apiError("test_numbers must be an array", 400);
  }

  const supabase = createServiceRoleClient();

  // If activating test_mode, require a connected WhatsApp session
  if (test_mode === true) {
    const { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("status")
      .eq("tenant_id", tenantId)
      .single();

    if (!session || session.status !== "connected") {
      return apiError(
        `session_not_connected: current status is '${session?.status ?? "none"}'`,
        422
      );
    }
  }

  const payload: Record<string, unknown> = { tenant_id: tenantId };
  if (test_mode !== undefined) payload.test_mode = test_mode;
  if (test_numbers !== undefined) {
    payload.test_numbers = (test_numbers as unknown[])
      .map((n) => String(n).trim())
      .filter(Boolean);
  }

  const { error: upsertError } = await supabase
    .from("settings")
    .upsert(payload, { onConflict: "tenant_id" });

  if (upsertError) return apiError(upsertError.message, 500);

  const { data: updated } = await supabase
    .from("settings")
    .select("test_mode, test_numbers")
    .eq("tenant_id", tenantId)
    .single();

  return ok({
    test_mode: updated?.test_mode ?? false,
    test_numbers: updated?.test_numbers ?? [],
  });
}
