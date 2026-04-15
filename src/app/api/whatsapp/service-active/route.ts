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

// GET — return current service_active state and session status
export async function GET(request: NextRequest) {
  const tenantId = await resolveTenantId(request);
  if (!tenantId) return apiError("Não autenticado", 401);

  const supabase = createServiceRoleClient();
  const { data: session } = await supabase
    .from("whatsapp_sessions")
    .select("status, service_active")
    .eq("tenant_id", tenantId)
    .single();

  return ok({
    service_active: session?.service_active ?? false,
    session_status: session?.status ?? "disconnected",
    has_connected_session: session?.status === "connected",
  });
}

// PUT — toggle service_active
// Body: { service_active: boolean }
export async function PUT(request: NextRequest) {
  const tenantId = await resolveTenantId(request);
  if (!tenantId) return apiError("Não autenticado", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const { service_active } = body as Record<string, unknown>;
  if (typeof service_active !== "boolean") {
    return apiError("service_active must be a boolean", 400);
  }

  const supabase = createServiceRoleClient();

  const { data: session } = await supabase
    .from("whatsapp_sessions")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .single();

  if (!session) {
    return apiError("no_session_found", 404);
  }

  if (service_active && session.status !== "connected") {
    return apiError(
      `session_not_connected: current status is '${session.status}'`,
      422
    );
  }

  const { error: updateError } = await supabase
    .from("whatsapp_sessions")
    .update({ service_active })
    .eq("id", session.id);

  if (updateError) return apiError(updateError.message, 500);

  return ok({ service_active, session_status: session.status });
}
