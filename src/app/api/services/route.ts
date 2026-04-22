import { NextRequest } from "next/server";
import { validateAuth, isAuthError, validateBody, isValidationError, ok, apiError, db } from "../_helpers";
import { serviceSchema } from "@/lib/validations/service";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const url = req.nextUrl.searchParams;
  const supabase = db();

  const professionalId = url.get("professional_id");

  if (professionalId) {
    const { data: ps, error: psErr } = await supabase
      .from("professional_services")
      .select("service_id")
      .eq("professional_id", professionalId);

    if (psErr) return apiError(psErr.message, 500);

    const serviceIds = (ps || []).map((r: { service_id: string }) => r.service_id);
    if (serviceIds.length === 0) return ok([]);

    const { data, error } = await supabase
      .from("services")
      .select("*, service_categories(name)")
      .eq("tenant_id", auth.tenantId)
      .eq("active", true)
      .in("id", serviceIds)
      .order("name");

    if (error) return apiError(error.message, 500);
    return ok(data);
  }

  let query = supabase
    .from("services")
    .select("*, service_categories(name)")
    .eq("tenant_id", auth.tenantId)
    .eq("active", true);

  if (url.get("category_id")) query = query.eq("category_id", url.get("category_id")!);

  const { data, error } = await query.order("name");
  if (error) return apiError(error.message, 500);
  return ok(data);
}

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const raw = await req.json();
  const validation = validateBody(serviceSchema, raw);
  if (isValidationError(validation)) return validation;
  const body = validation.data;

  const { data, error } = await db()
    .from("services")
    .insert({ ...body, tenant_id: auth.tenantId })
    .select()
    .single();

  if (error) return apiError(error.message, 500);
  return ok(data, 201);
}
