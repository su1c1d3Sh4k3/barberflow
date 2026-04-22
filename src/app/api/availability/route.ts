import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../_helpers";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const p = req.nextUrl.searchParams;

  const professionalId = p.get("professional_id");
  const serviceId = p.get("service_id");
  const date = p.get("date");
  const dateFrom = p.get("date_from");

  if (!professionalId) return apiError("Parâmetro obrigatório ausente: professional_id", 400);
  if (!serviceId) return apiError("Parâmetro obrigatório ausente: service_id", 400);
  if (!date && !dateFrom) return apiError("Parâmetro obrigatório ausente: date ou date_from (formato YYYY-MM-DD)", 400);

  const targetDate = date || dateFrom!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return apiError(`Formato de data inválido: "${targetDate}". Use YYYY-MM-DD (ex: 2026-04-23)`, 400);
  }

  const supabase = db();

  // Validate professional exists
  const { data: professional } = await supabase
    .from("professionals")
    .select("id, name, active")
    .eq("id", professionalId)
    .eq("tenant_id", auth.tenantId)
    .maybeSingle();

  if (!professional) {
    return apiError(`Profissional não encontrado: ${professionalId}`, 404);
  }
  if (!professional.active) {
    return apiError(`Profissional inativo: "${professional.name}"`, 400);
  }

  // Validate service exists
  const { data: service } = await supabase
    .from("services")
    .select("id, name, duration_min, active")
    .eq("id", serviceId)
    .eq("tenant_id", auth.tenantId)
    .maybeSingle();

  if (!service) {
    return apiError(`Serviço não encontrado: ${serviceId}. Use GET /api/services para listar os serviços disponíveis.`, 404);
  }
  if (!service.active) {
    return apiError(`Serviço inativo: "${service.name}"`, 400);
  }
  if (!service.duration_min) {
    return apiError(`Serviço "${service.name}" sem duração configurada (duration_min)`, 400);
  }

  const { data, error } = await supabase.rpc("get_available_slots", {
    p_tenant_id: auth.tenantId,
    p_professional_id: professionalId,
    p_service_id: serviceId,
    p_date: targetDate,
  });

  if (error) return apiError(`Erro ao calcular disponibilidade: ${error.message}`, 500);
  return ok(data);
}
