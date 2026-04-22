import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../_helpers";

/**
 * GET /api/availability/ia
 *
 * Endpoint de disponibilidade otimizado para consumo pela IA via n8n.
 * Retorna lista simplificada de horários em formato HH:MM (fuso BRT).
 * Suporta filtro por período (manhã/tarde).
 *
 * NÃO altere este endpoint para não quebrar o frontend/chatbot que usam
 * /api/availability com o formato ISO slot_start/slot_end.
 */
export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const p = req.nextUrl.searchParams;
  const professionalId = p.get("professional_id");
  const serviceId = p.get("service_id");
  const date = p.get("date");
  const period = p.get("period"); // "manha" | "tarde" | omitido = todos

  // ── Validações obrigatórias ──────────────────────────────────────────────
  if (!professionalId) {
    return apiError("Parâmetro obrigatório ausente: professional_id (UUID do profissional)", 400);
  }
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

  // ── Validar se o profissional existe e pertence ao tenant ────────────────
  const { data: professional, error: profErr } = await supabase
    .from("professionals")
    .select("id, name, active")
    .eq("id", professionalId)
    .eq("tenant_id", auth.tenantId)
    .maybeSingle();

  if (profErr) return apiError(`Erro ao buscar profissional: ${profErr.message}`, 500);
  if (!professional) {
    return apiError(`Profissional não encontrado: ${professionalId}. Verifique se o ID está correto e pertence ao tenant.`, 404);
  }
  if (!professional.active) {
    return apiError(`Profissional inativo: "${professional.name}". Apenas profissionais ativos aceitam agendamentos.`, 400);
  }

  // ── Validar se o serviço existe e pertence ao tenant ────────────────────
  const { data: service, error: svcErr } = await supabase
    .from("services")
    .select("id, name, duration_min, active")
    .eq("id", serviceId)
    .eq("tenant_id", auth.tenantId)
    .maybeSingle();

  if (svcErr) return apiError(`Erro ao buscar serviço: ${svcErr.message}`, 500);
  if (!service) {
    return apiError(`Serviço não encontrado: ${serviceId}. Verifique se o ID está correto. Use GET /api/services para listar os serviços disponíveis.`, 404);
  }
  if (!service.active) {
    return apiError(`Serviço inativo: "${service.name}". Apenas serviços ativos podem ser agendados.`, 400);
  }
  if (!service.duration_min) {
    return apiError(`Serviço "${service.name}" sem duração configurada (duration_min). Configure a duração no painel.`, 400);
  }

  // ── Verificar se há agenda cadastrada para o dia da semana ───────────────
  const dow = new Date(date + "T12:00:00Z").getUTCDay(); // 0=Dom ... 6=Sáb
  const { data: schedule } = await supabase
    .from("professional_schedules")
    .select("start_time, end_time")
    .eq("professional_id", professionalId)
    .eq("weekday", dow)
    .maybeSingle();

  const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  if (!schedule) {
    return ok({
      horarios: [],
      total: 0,
      periodo: period || "todos",
      data: date,
      profissional: professional.name,
      servico: service.name,
      aviso: `${professional.name} não trabalha às ${DAY_NAMES[dow]}s. Tente outro dia.`,
    });
  }

  // ── Buscar slots disponíveis ─────────────────────────────────────────────
  const { data: slots, error: slotErr } = await supabase.rpc("get_available_slots", {
    p_tenant_id: auth.tenantId,
    p_professional_id: professionalId,
    p_service_id: serviceId,
    p_date: date,
  });

  if (slotErr) return apiError(`Erro ao calcular disponibilidade: ${slotErr.message}`, 500);

  if (!slots || slots.length === 0) {
    return ok({
      horarios: [],
      total: 0,
      periodo: period || "todos",
      data: date,
      profissional: professional.name,
      servico: service.name,
      aviso: `Nenhum horário disponível para ${date}. A agenda pode estar lotada ou todos os slots já passaram.`,
    });
  }

  // ── Converter para HH:MM no fuso BRT e aplicar filtro de período ─────────
  let horarios: string[] = slots.map((s: { slot_start: string }) => {
    return new Date(s.slot_start).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  });

  if (period === "manha") {
    horarios = horarios.filter((h) => parseInt(h.split(":")[0]) < 12);
  } else if (period === "tarde") {
    horarios = horarios.filter((h) => parseInt(h.split(":")[0]) >= 12);
  }

  if (horarios.length === 0) {
    const periodoLabel = period === "manha" ? "manhã (antes das 12h)" : "tarde (a partir das 12h)";
    return ok({
      horarios: [],
      total: 0,
      periodo: period,
      data: date,
      profissional: professional.name,
      servico: service.name,
      aviso: `Nenhum horário disponível no período da ${periodoLabel} em ${date}.`,
    });
  }

  return ok({
    horarios,
    total: horarios.length,
    periodo: period || "todos",
    data: date,
    profissional: professional.name,
    servico: service.name,
  });
}
