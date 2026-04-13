import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "@/app/api/_helpers";
import { logAudit } from "@/lib/audit";

/**
 * GET  /api/holidays?company_id=... — list holidays for a company
 * POST /api/holidays — create a holiday entry
 */

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const companyId = req.nextUrl.searchParams.get("company_id");
  if (!companyId) return apiError("company_id is required", 400);

  const { data, error } = await db()
    .from("holidays")
    .select("*")
    .eq("company_id", companyId)
    .order("date", { ascending: true });

  if (error) return apiError(error.message, 500);
  return ok(data);
}

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const { company_id, date, name } = await req.json();
  if (!company_id || !date || !name) {
    return apiError("company_id, date and name are required", 422);
  }

  const { data, error } = await db()
    .from("holidays")
    .insert({ company_id, date, name })
    .select()
    .single();

  if (error) return apiError(error.message, 500);

  await logAudit(auth.tenantId, null, "create", "holiday", data.id, { date, name });

  return ok(data, 201);
}

export async function DELETE(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const holidayId = req.nextUrl.searchParams.get("id");
  if (!holidayId) return apiError("id is required", 400);

  // Verify the holiday belongs to a company owned by this tenant
  const { data: holiday } = await db()
    .from("holidays")
    .select("id, company_id, companies!inner(tenant_id)")
    .eq("id", holidayId)
    .eq("companies.tenant_id", auth.tenantId)
    .single();

  if (!holiday) return apiError("Holiday not found or access denied", 404);

  const { error } = await db()
    .from("holidays")
    .delete()
    .eq("id", holidayId);

  if (error) return apiError(error.message, 500);

  await logAudit(auth.tenantId, null, "delete", "holiday", holidayId);

  return ok({ deleted: true });
}
