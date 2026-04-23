import { NextRequest } from "next/server";
import { validateAuth, isAuthError, validateBody, isValidationError, ok, apiError, db } from "../_helpers";
import { serviceSchema } from "@/lib/validations/service";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const url = req.nextUrl.searchParams;
  const supabase = db();

  const professionalId = url.get("professional_id");
  const categoryId = url.get("category_id");
  const companyId = url.get("company_id");

  // Resolre service IDs permitidos pelo filtro de professional_id ou company_id
  let allowedServiceIds: string[] | null = null;

  if (professionalId) {
    // Serviços vinculados a um profissional específico
    const { data: ps, error: psErr } = await supabase
      .from("professional_services")
      .select("service_id")
      .eq("professional_id", professionalId);

    if (psErr) return apiError(psErr.message, 500);
    allowedServiceIds = (ps || []).map((r: { service_id: string }) => r.service_id);
    if (allowedServiceIds.length === 0) return ok([]);

  } else if (companyId) {
    // Serviços disponíveis na filial: union de serviços vinculados a qualquer
    // profissional ativo daquela filial
    const { data: profs, error: profErr } = await supabase
      .from("professionals")
      .select("id")
      .eq("tenant_id", auth.tenantId)
      .eq("company_id", companyId)
      .eq("active", true);

    if (profErr) return apiError(profErr.message, 500);

    const profIds = (profs || []).map((p: { id: string }) => p.id);
    if (profIds.length === 0) return ok([]);

    const { data: ps, error: psErr } = await supabase
      .from("professional_services")
      .select("service_id")
      .in("professional_id", profIds);

    if (psErr) return apiError(psErr.message, 500);

    // Deduplica
    const seen: Record<string, boolean> = {};
    allowedServiceIds = (ps || [])
      .map((r: { service_id: string }) => r.service_id)
      .filter((id: string) => { if (seen[id]) return false; seen[id] = true; return true; });

    if (allowedServiceIds.length === 0) return ok([]);
  }

  let query = supabase
    .from("services")
    .select("*, service_categories(name)")
    .eq("tenant_id", auth.tenantId)
    .eq("active", true);

  if (allowedServiceIds !== null) query = query.in("id", allowedServiceIds);
  if (categoryId) query = query.eq("category_id", categoryId);

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
