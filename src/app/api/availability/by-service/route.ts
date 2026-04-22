import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../_helpers";

/**
 * GET /api/availability/by-service
 *
 * Retorna todos os profissionais habilitados para um serviço com seus
 * horários disponíveis em uma data e período específicos.
 *
 * Query params:
 *   service_id  UUID do serviço
 *   date        YYYY-MM-DD
 *   period      "manha" | "tarde" (opcional)
 */
export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const p = req.nextUrl.searchParams;
  const serviceId = p.get("service_id");
  const date = p.get("date");
  const period = p.get("period");

  // ── Validações ────────────────────────────────────────────────────────────
  if (!serviceId) {
    return apiError("Parâmetro obrigatório ausente: service_id (UUID do serviço)", 400);
  }
  if (!date) {
    return apiError("Parâmetro obrigatório ausente: date (formato YYYY-MM-DD, ex: 2026-04-23)", 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return apiError(`Formato de date inválido: "${date}". Use YYYY-MM-DD (ex: 2026-04-23)`, 400);
  }
  if (period && !["manha", "tarde"].includes(period)) {
    return apiError(`Valor de period inválido: "${period}". Use "manha" (antes das 12h) ou "tarde" (a partir das 12h)`, 400);
  }

  const supabase = db();

  // ── Validar serviço ───────────────────────────────────────────────────────
  const { data: service, error: svcErr } = await supabase
    .from("services")
    .select("id, name, duration_min, active")
    .eq("id", serviceId)
    .eq("tenant_id", auth.tenantId)
    .maybeSingle();

  if (svcErr) return apiError(`Erro ao buscar serviço: ${svcErr.message}`, 500);
  if (!service) {
    return apiError(`Serviço não encontrado: ${serviceId}. Use GET /api/services para listar os disponíveis.`, 404);
  }
  if (!service.active) {
    return apiError(`Serviço inativo: "${service.name}"`, 400);
  }
  if (!service.duration_min) {
    return apiError(`Serviço "${service.name}" sem duração configurada (duration_min). Configure no painel.`, 400);
  }

  // ── Buscar profissionais habilitados para o serviço ───────────────────────
  const { data: ps, error: psErr } = await supabase
    .from("professional_services")
    .select("professional_id")
    .eq("service_id", serviceId);

  if (psErr) return apiError(`Erro ao buscar profissionais do serviço: ${psErr.message}`, 500);

  const profIds = (ps ?? []).map((r: { professional_id: string }) => r.professional_id);
  if (profIds.length === 0) {
    return apiError(`Nenhum profissional cadastrado para o serviço "${service.name}". Vincule profissionais no painel.`, 400);
  }

  // ── Buscar dados dos profissionais (apenas ativos) ────────────────────────
  const { data: professionals, error: profErr } = await supabase
    .from("professionals")
    .select("id, name")
    .in("id", profIds)
    .eq("tenant_id", auth.tenantId)
    .eq("active", true)
    .order("name");

  if (profErr) return apiError(`Erro ao buscar profissionais: ${profErr.message}`, 500);

  if (!professionals || professionals.length === 0) {
    return apiError(`Nenhum profissional ativo encontrado para o serviço "${service.name}".`, 400);
  }

  // ── Buscar slots para cada profissional e aplicar filtro de período ───────
  const resultado: Array<{
    profissional_id: string;
    profissional: string;
    horarios: string[];
    total: number;
  }> = [];

  for (const prof of professionals) {
    const { data: slots, error: slotErr } = await supabase.rpc("get_available_slots", {
      p_tenant_id: auth.tenantId,
      p_professional_id: prof.id,
      p_service_id: serviceId,
      p_date: date,
    });

    if (slotErr) continue; // pula profissional com erro, não aborta tudo

    let horarios: string[] = (slots ?? []).map((s: { slot_start: string }) =>
      new Date(s.slot_start).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    );

    if (period === "manha") {
      horarios = horarios.filter((h) => parseInt(h.split(":")[0], 10) < 12);
    } else if (period === "tarde") {
      horarios = horarios.filter((h) => parseInt(h.split(":")[0], 10) >= 12);
    }

    resultado.push({
      profissional_id: prof.id,
      profissional: prof.name,
      horarios,
      total: horarios.length,
    });
  }

  // Ordenar por quem tem mais horários disponíveis
  resultado.sort((a, b) => b.total - a.total);

  const periodoLabel = period === "manha" ? "manhã" : period === "tarde" ? "tarde" : "todos";

  return ok({
    servico: service.name,
    servico_id: serviceId,
    data: date,
    periodo: periodoLabel,
    profissionais: resultado,
    total_profissionais: resultado.length,
  });
}
