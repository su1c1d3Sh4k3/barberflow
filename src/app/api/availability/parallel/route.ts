import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../_helpers";

/**
 * GET /api/availability/parallel
 *
 * Busca horários onde 2 ou mais serviços podem ser realizados SIMULTANEAMENTE
 * por profissionais diferentes.
 *
 * Query params:
 *   service_ids  UUIDs separados por vírgula (mínimo 2)
 *   date         YYYY-MM-DD
 *   period       "manha" | "tarde" (opcional)
 */

// serviceSlots[serviceId][professionalId] = { [slotMs]: true }
type ServiceSlotsMap = Record<string, Record<string, Record<string, boolean>>>;

// Backtracking: tenta atribuir um profissional único por serviço para um dado slot.
function tryAssign(
  serviceIds: string[],
  serviceSlots: ServiceSlotsMap,
  slotKey: string,
  usedProfs: Record<string, boolean>,
  index: number,
  current: Record<string, string>
): Record<string, string> | null {
  if (index === serviceIds.length) {
    const copy: Record<string, string> = {};
    for (const k of Object.keys(current)) copy[k] = current[k];
    return copy;
  }

  const serviceId = serviceIds[index];
  const profSlots = serviceSlots[serviceId] ?? {};

  for (const profId of Object.keys(profSlots)) {
    if (usedProfs[profId]) continue;
    if (!profSlots[profId][slotKey]) continue;

    usedProfs[profId] = true;
    current[serviceId] = profId;

    const result = tryAssign(serviceIds, serviceSlots, slotKey, usedProfs, index + 1, current);
    if (result) return result;

    delete usedProfs[profId];
    delete current[serviceId];
  }

  return null;
}

function dedupe(arr: string[]): string[] {
  const seen: Record<string, boolean> = {};
  return arr.filter((s) => {
    if (!s || seen[s]) return false;
    seen[s] = true;
    return true;
  });
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

  const serviceIds = dedupe(serviceIdsRaw.split(",").map((s) => s.trim()));
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
    const svc = (services ?? []).find((s: { id: string }) => s.id === id);
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

    if (psErr) return apiError(`Erro ao buscar profissionais para o serviço ${serviceId}: ${psErr.message}`, 500);

    const profIds = (ps ?? []).map((r: { professional_id: string }) => r.professional_id);
    if (profIds.length === 0) {
      const svc = (services ?? []).find((s: { id: string }) => s.id === serviceId);
      return apiError(
        `Nenhum profissional cadastrado para o serviço "${svc?.name ?? serviceId}". Vincule pelo menos um profissional.`,
        400
      );
    }
    serviceProfMap[serviceId] = profIds;
  }

  // ── Buscar slots para cada (serviço × profissional) ───────────────────────
  // serviceSlots[serviceId][professionalId][slotMsKey] = true
  const serviceSlots: ServiceSlotsMap = {};

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
        serviceSlots[serviceId][profId] = {};
        for (const s of slots as Array<{ slot_start: string }>) {
          const key = String(new Date(s.slot_start).getTime());
          serviceSlots[serviceId][profId][key] = true;
        }
      }
    }
  }

  // ── Coletar todos os horários candidatos (união) ──────────────────────────
  const allSlotKeys: Record<string, boolean> = {};
  for (const serviceId of serviceIds) {
    for (const profId of Object.keys(serviceSlots[serviceId])) {
      for (const key of Object.keys(serviceSlots[serviceId][profId])) {
        allSlotKeys[key] = true;
      }
    }
  }

  // ── Buscar nomes dos profissionais ────────────────────────────────────────
  const allProfIdsMap: Record<string, boolean> = {};
  for (const serviceId of serviceIds) {
    for (const id of serviceProfMap[serviceId]) {
      allProfIdsMap[id] = true;
    }
  }
  const allProfIds = Object.keys(allProfIdsMap);

  const { data: professionals } = await supabase
    .from("professionals")
    .select("id, name")
    .in("id", allProfIds);

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

  const sortedSlotKeys = Object.keys(allSlotKeys).sort((a, b) => Number(a) - Number(b));

  for (const slotKey of sortedSlotKeys) {
    const assignment = tryAssign(serviceIds, serviceSlots, slotKey, {}, 0, {});
    if (!assignment) continue;

    const horaBRT = new Date(Number(slotKey)).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    const hora = parseInt(horaBRT.split(":")[0], 10);

    if (period === "manha" && hora >= 12) continue;
    if (period === "tarde" && hora < 12) continue;

    resultado.push({
      horario: horaBRT,
      atribuicoes: Object.keys(assignment).map((serviceId) => ({
        servico: svcNameMap[serviceId] ?? serviceId,
        servico_id: serviceId,
        profissional: profNameMap[assignment[serviceId]] ?? assignment[serviceId],
        profissional_id: assignment[serviceId],
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
      servicos: (services ?? []).map((s: { id: string; name: string; duration_min: number }) => ({ id: s.id, nome: s.name, duracao_min: s.duration_min })),
      aviso: `Nenhum horário simultâneo disponível${periodLabel} em ${date}. Tente outro dia ou período.`,
    });
  }

  return ok({
    slots_simultaneos: resultado,
    total: resultado.length,
    data: date,
    periodo: period ?? "todos",
    servicos: (services ?? []).map((s: { id: string; name: string; duration_min: number }) => ({ id: s.id, nome: s.name, duracao_min: s.duration_min })),
  });
}
