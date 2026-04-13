import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../_helpers";

/** PATCH /api/contacts/bulk — bulk update contacts */
export async function PATCH(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const { ids, updates } = (await req.json()) as {
    ids: string[];
    updates: Record<string, unknown>;
  };

  if (!Array.isArray(ids) || ids.length === 0) {
    return apiError("ids array is required", 422);
  }

  // Only allow safe fields
  const allowed = ["status", "tags", "ia_enabled", "notes"];
  const safeUpdates: Record<string, unknown> = {};
  for (const key of Object.keys(updates)) {
    if (allowed.includes(key)) safeUpdates[key] = updates[key];
  }

  if (Object.keys(safeUpdates).length === 0) {
    return apiError("No valid fields to update", 422);
  }

  const { error } = await db()
    .from("contacts")
    .update(safeUpdates)
    .in("id", ids)
    .eq("tenant_id", auth.tenantId);

  if (error) return apiError(error.message, 500);
  return ok({ updated: ids.length });
}
