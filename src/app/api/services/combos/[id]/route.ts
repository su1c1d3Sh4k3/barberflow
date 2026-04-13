import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "@/app/api/_helpers";

/**
 * GET /api/services/combos/:id — Get a combo with its children
 * DELETE /api/services/combos/:id — Delete a combo (and its links)
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const supabase = db();

  const { data: combo, error } = await supabase
    .from("services")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", auth.tenantId)
    .eq("is_combo", true)
    .single();

  if (error || !combo) return apiError("Combo não encontrado", 404);

  // Fetch children
  const { data: links } = await supabase
    .from("service_combos")
    .select("child_service_id")
    .eq("parent_service_id", id);

  const childIds = (links || []).map((l: { child_service_id: string }) => l.child_service_id);

  let children: unknown[] = [];
  if (childIds.length > 0) {
    const { data } = await supabase
      .from("services")
      .select("id, name, duration_min, price")
      .in("id", childIds);
    children = data || [];
  }

  return ok({ ...combo, children });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const supabase = db();

  // Verify combo belongs to tenant
  const { data: combo } = await supabase
    .from("services")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", auth.tenantId)
    .eq("is_combo", true)
    .single();

  if (!combo) return apiError("Combo não encontrado", 404);

  // Delete combo links (cascade will handle this, but be explicit)
  await supabase.from("service_combos").delete().eq("parent_service_id", id);

  // Deactivate the combo service
  const { error } = await supabase
    .from("services")
    .update({ active: false })
    .eq("id", id);

  if (error) return apiError(error.message, 500);

  return ok({ deleted: true });
}
