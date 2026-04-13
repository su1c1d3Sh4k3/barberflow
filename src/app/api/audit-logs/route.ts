import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../_helpers";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const p = req.nextUrl.searchParams;
  const limit = Math.min(parseInt(p.get("limit") || "50"), 200);
  const offset = parseInt(p.get("offset") || "0");
  const entity = p.get("entity");

  let query = db()
    .from("audit_logs")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (entity) query = query.eq("entity", entity);

  const { data, error } = await query;
  if (error) return apiError(error.message, 500);
  return ok(data);
}

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const { action, entity, entity_id, metadata, user_id } = await req.json();
  if (!action || !entity) return apiError("action and entity are required", 422);

  const { data, error } = await db()
    .from("audit_logs")
    .insert({
      tenant_id: auth.tenantId,
      user_id: user_id || null,
      action,
      entity,
      entity_id: entity_id || null,
      metadata: metadata || {},
    })
    .select()
    .single();

  if (error) return apiError(error.message, 500);
  return ok(data, 201);
}
