import { NextRequest } from "next/server";
import { validateAuth, isAuthError, validateBody, isValidationError, ok, apiError, db } from "../_helpers";
import { professionalSchema } from "@/lib/validations/professional";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const p = req.nextUrl.searchParams;
  const serviceId = p.get("service_id");
  const companyId = p.get("company_id");
  const supabase = db();

  let query = supabase
    .from("professionals")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .eq("active", true);

  // Filtrar por filial
  if (companyId) query = query.eq("company_id", companyId);

  // Filtrar por serviço (profissionais vinculados ao serviço)
  if (serviceId) {
    const { data: ps } = await supabase
      .from("professional_services")
      .select("professional_id")
      .eq("service_id", serviceId);
    const ids = (ps || []).map((r: { professional_id: string }) => r.professional_id);
    if (ids.length === 0) return ok([]);
    query = query.in("id", ids);
  }

  const { data, error } = await query.order("name");
  if (error) return apiError(error.message, 500);
  return ok(data);
}

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const raw = await req.json();
  const validation = validateBody(professionalSchema, raw);
  if (isValidationError(validation)) return validation;
  const body = validation.data;
  const supabase = db();

  const { service_ids, ...professionalData } = body;

  // Auto-assign company_id if not provided
  let companyId = professionalData.company_id;
  if (!companyId) {
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("tenant_id", auth.tenantId)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();
    companyId = company?.id;
  }

  const { data, error } = await supabase
    .from("professionals")
    .insert({ ...professionalData, tenant_id: auth.tenantId, company_id: companyId })
    .select()
    .single();

  if (error) return apiError(error.message, 500);

  // Link services if provided
  if (service_ids && Array.isArray(service_ids) && service_ids.length > 0) {
    const links = service_ids.map((sid: string) => ({
      professional_id: data.id,
      service_id: sid,
      tenant_id: auth.tenantId,
    }));
    const { error: linkError } = await supabase.from("professional_services").insert(links);
    if (linkError) return apiError(linkError.message, 500);
  }

  await logAudit(auth.tenantId, null, "create", "professional", data.id, { name: data.name });

  return ok(data, 201);
}
