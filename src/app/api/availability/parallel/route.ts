import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../_helpers";

/**
 * GET /api/availability/parallel
 *
 * Busca horários onde 2 ou mais serviços podem ser realizados SIMULTANEAMENTE
 * por profissionais diferentes. Útil para grupos (ex: cabelo + barba + manicure)
 * onde cada profissional faz um serviço ao mesmo tempo.
 *
 * Query params:
 *   service_ids  UUIDs separados por vírgula (mínimo 2)
 *   date         YYYY-MM-DD
 *   period       "manha" | "tarde" (opcional)
 */

// Backtracking: tenta atribuir um profissional único por serviço para um dado slot.
// Retorna o mapa serviceId→professionalId ou null se impossível.
function tryAssign(
  serviceIds: string[],
  serviceSlots: Record<string, Record<string, Set<number>>>,
  slotMs: number,
  usedProfs: Set<string>,
  index = 0,
  current: Record<string, string> = {}
): Record<string, string> | null {
  if (index === serviceIds.length) return { ...current };

  const serviceId = serviceIds[index];
  const profSlots = serviceSlots[serviceId] ?? {};

  for (const [profId, slots] of Object.entries(profSlots)) {
    if (usedProfs.has(profId)) continue;
    if (!slots.has(slotMs)) continue;

    usedProfs.add(profId);
    current[serviceId] = profId;

    const result = tryAssign(serviceIds, serviceSlots, slotMs, usedProfs, index + 1, current);
    if (result) return result;

    usedProfs.delete(profId);
    delete current[serviceId];
  }

  return null;
}

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const p = req.nextUrl.searchParams;
  const serviceIdsRaw = p.get("service_ids");
  const date = p.get("date");
  const period = p.get("period");

  // ── Validações ────────────────────────────────────────────────────────────
  if (!serviceIdsRaw) {
    return apiError("Parâmetro obrigatório ausente: service_ids (UUIDs separados por vírgula, mínimo 2)", 400);
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

  const serviceIds = [...new Set(serviceIdsRaw.split(",").map((s) => s.trim()).filter(Boolean))];
  if (serviceIds.length < 2) {
    return apiError("É necessário informar pelo menos 2 service_ids diferentes para agendamento simultâneo", 400);
  }

  const supabase = db();

  // ── Validar serviços ──────────────────────────────────────────────────────
  const { data: services, error: svcErr } = await supabase
    .from("services")
    .select("id, name, duration_min, active")
    .eq("tenant_id", auth.tenantId)
    .in("id", serviceIds);

  if (svcErr) return apiError(`Erro ao buscar serviços: ${svcErr.message}`, 500);

  for (const id of serviceIds) {
    const svc = (services ?? []).find((s) => s.id === id);
    if (!svc) {
      return apiError(`Serviço não encontrado: ${id}. Use GET /api/services para listar os disponíveis.`, 404);
    }
    if (!svc.active) return apiError(`Serviço inativo: "${svc.name}"`, 400);
    if (!svc.duration_min) {
      return apiError(`Serviço "${svc.name}" sem duração configurada (duration_min). Configure no painel.`, 400);
    }
  }

  // ── Para cada serviço, buscar profissionais habilitados ───────────────────
  const serviceProfMap: Record<string, string[]> = {};
  for (const serviceId of serviceIds) {
    const { data: ps, error: psErr } = await supabase
      .from("professional_services")
      .select("professional_id")
      .eq("service_id", serviceId);

    if (psErr) return apiError(`Erro ao buscar profissionais para serviço ${serviceId}: ${psErr.message}`, 500);

    const profIds = (ps ?? []).map((r: { professional_id: string }) => r.professional_id);
    if (profIds.length === 0) {
      const svc = (services ?? []).find((s) => s.id === serviceId)!;
      return apiError(
        `Nenhum profissional cadastrado para o serviço "${svc.name}". Vincule pelo menos um profissional a este serviço.`,
        400
      );
    }
    serviceProfMap[serviceId] = profIds;
  }

  // ── Buscar slots disponíveis para cada (profissional × serviço) ──────────
  // serviceSlots[serviceId][professionalId] = Set<timestamp_ms>
  const serviceSlots: Record<string, Record<string, Set<number>>> = {};

  for (const serviceId of serviceIds) {
    serviceSlots[serviceId] = {};
    for (const profId of serviceProfMap[serviceId]) {
      const { data: slots } = await supabase.rpc("get_available_slots", {
        p_tenant_id: auth.tenantId,
        p_professional_id: profId,
        p_service_id: serviceId,
        p_date: date,
      });

      if (slots && slots.length > 0) {
        serviceSlots[serviceId][profId] = new Set(
          slots.map((s: { slot_start: string }) => new Date(s.slot_start).getTime())
        );
      }
    }
  }

  // ── Coletar todos os horários candidatos (união de todos os serviços) ─────
  const allSlotMs = new Set<number>();
  for (const serviceId of serviceIds) {
    for (const slots of Object.values(serviceSlots[serviceId])) {
      for (const ms of slots) allSlotMs.add(ms);
    }
  }

  // ── Buscar nomes dos profissionais ────────────────────────────────────────
  const allProfIds = new Set<string>();
  for (const ids of Object.values(serviceProfMap)) {
    for (const id of ids) allProfIds.add(id);
  }

  const { data: professionals } = await supabase
    .from("professionals")
    .select("id, name")
    .in("id", Array.from(allProfIds));

  const profNameMap: Record<string, string> = {};
  for (const prof of professionals ?? []) {
    profNameMap[prof.id] = prof.name;
  }

  const svcNameMap: Record<string, string> = {};
  for (const svc of services ?? []) {
    svcNameMap[svc.id] = svc.name;
  }

  // ── Para cada slot candidato, tentar atribuir um profissional por serviço ─
  const resultado: Array<{
    horario: string;
    atribuicoes: Array<{ servico: string; servico_id: string; profissional: string; profissional_id: string }>;
  }> = [];

  for (const slotMs of Array.from(allSlotMs).sort()) {
    const assignment = tryAssign(serviceIds, serviceSlots, slotMs, new Set<string>());
    if (!assignment) continue;

    // Aplicar filtro de período
    const horaBRT = new Date(slotMs).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    const hora = parseInt(horaBRT.split(":")[0]);

    if (period === "manha" && hora >= 12) continue;
    if (period === "tarde" && hora < 12) continue;

    resultado.push({
      horario: horaBRT,
      atribuicoes: Object.entries(assignment).map(([serviceId, profId]) => ({
        servico: svcNameMap[serviceId] ?? serviceId,
        servico_id: serviceId,
        profissional: profNameMap[profId] ?? profId,
        profissional_id: profId,
      })),
    });
  }

  if (resultado.length === 0) {
    const periodLabel = period === "manha" ? " de manhã" : period === "tarde" ? " à tarde" : "";
    return ok({
      slots_simultaneos: [],
      total: 0,
      data: date,
      periodo: period ?? "todos",
      servicos: (services ?? []).map((s) => ({ id: s.id, nome: s.name, duracao_min: s.duration_min })),
      aviso: `Nenhum horário simultâneo disponível${periodLabel} em ${date}. Tente outro dia ou período.`,
    });
  }

  return ok({
    slots_simultaneos: resultado,
    total: resultado.length,
    data: date,
    periodo: period ?? "todos",
    servicos: (services ?? []).map((s) => ({ id: s.id, nome: s.name, duracao_min: s.duration_min })),
  });
}
