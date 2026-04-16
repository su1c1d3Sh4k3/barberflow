// Supabase Edge Function — whatsapp-webhook
// Receives uazapi webhook payloads and runs the BarberFlow bot state machine.
// Deploy with: supabase functions deploy whatsapp-webhook --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Env ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UAZAPI_SERVER_URL = Deno.env.get("UAZAPI_SERVER_URL") ?? "";
const WEBHOOK_TOKEN = Deno.env.get("WHATSAPP_WEBHOOK_TOKEN") ?? "";

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// ─── uazapi helpers (native fetch, no Node imports) ──────────────────────────

async function uazapiFetch(
  path: string,
  token: string,
  body?: Record<string, unknown>,
  method = "POST"
): Promise<void> {
  try {
    const resp = await fetch(`${UAZAPI_SERVER_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        token,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      console.error(`uazapi ${path} error: ${resp.status} ${t}`);
    }
  } catch (err) {
    console.error(`uazapi ${path} fetch error:`, err);
  }
}

async function sendText(phone: string, message: string, token: string) {
  await uazapiFetch("/send/text", token, { phone, message });
}

async function sendButtons(
  phone: string,
  text: string,
  buttons: Array<{ id: string; text: string }>,
  token: string
) {
  try {
    await uazapiFetch("/send/buttons", token, { phone, title: text, buttons });
  } catch {
    const fallback = text + "\n\n" + buttons.map((b, i) => `${i + 1}. ${b.text}`).join("\n");
    await sendText(phone, fallback, token);
  }
}

async function sendList(
  phone: string,
  text: string,
  description: string,
  buttonText: string,
  sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
  token: string
) {
  try {
    await uazapiFetch("/send/menu", token, { phone, title: text, description, buttonText, sections });
  } catch {
    const rows = sections.flatMap((s) => s.rows);
    const fallback = text + "\n\n" + rows.map((r, i) => `${i + 1}. ${r.title}${r.description ? ` (${r.description})` : ""}`).join("\n");
    await sendText(phone, fallback, token);
  }
}

async function safeSendButtons(
  phone: string,
  text: string,
  buttons: Array<{ id: string; text: string }>,
  token: string
) {
  try {
    await sendButtons(phone, text, buttons, token);
  } catch {
    const fallback = text + "\n\n" + buttons.map((b, i) => `${i + 1}. ${b.text}`).join("\n");
    await sendText(phone, fallback, token);
  }
}

async function safeSendList(
  phone: string,
  text: string,
  title: string,
  buttonText: string,
  sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
  token: string
) {
  try {
    await sendList(phone, text, title, buttonText, sections, token);
  } catch {
    const rows = sections.flatMap((s) => s.rows);
    const fallback = text + "\n\n" + rows.map((r, i) => `${i + 1}. ${r.title}${r.description ? ` (${r.description})` : ""}`).join("\n");
    await sendText(phone, fallback, token);
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface BotContext {
  tenantId: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  instanceToken: string;
}

interface ConversationState {
  id: string;
  current_state: string;
  context: Record<string, unknown>;
  last_interaction_at: string;
  expires_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractId(message: string, prefix: string): string | null {
  const msg = message.trim();
  return msg.startsWith(prefix) ? msg.replace(prefix, "") : null;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function parseDate(input: string): Date | null {
  const text = input.toLowerCase().trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (text === "hoje" || text === "agora") return today;
  if (text === "amanhã" || text === "amanha") {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (text === "depois de amanhã" || text === "depois de amanha") {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return d;
  }

  const daqMatch = text.match(/(?:daqui|em)\s+(\d{1,2})\s+dias?/);
  if (daqMatch) {
    const days = parseInt(daqMatch[1]);
    if (days >= 1 && days <= 60) {
      const d = new Date(today);
      d.setDate(d.getDate() + days);
      return d;
    }
  }

  if (text.includes("semana que vem") || text.includes("proxima semana") || text.includes("próxima semana")) {
    const d = new Date(today);
    const currentDow = d.getDay();
    const daysToMonday = currentDow === 0 ? 1 : 8 - currentDow;
    d.setDate(d.getDate() + daysToMonday);
    return d;
  }

  const fullDateMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (fullDateMatch) {
    return new Date(parseInt(fullDateMatch[3]), parseInt(fullDateMatch[2]) - 1, parseInt(fullDateMatch[1]));
  }

  const diaMatch = text.match(/^(?:dia\s+)?(\d{1,2})$/);
  if (diaMatch) {
    const day = parseInt(diaMatch[1]);
    if (day >= 1 && day <= 31) {
      const d = new Date(today.getFullYear(), today.getMonth(), day);
      if (d < today) d.setMonth(d.getMonth() + 1);
      return d;
    }
  }

  const ddmmMatch = text.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (ddmmMatch) {
    const d = new Date(today.getFullYear(), parseInt(ddmmMatch[2]) - 1, parseInt(ddmmMatch[1]));
    if (d < today) d.setFullYear(d.getFullYear() + 1);
    return d;
  }

  const weekdays: Record<string, number> = {
    domingo: 0, segunda: 1, "segunda-feira": 1, terca: 2, "terça": 2, "terça-feira": 2,
    quarta: 3, "quarta-feira": 3, quinta: 4, "quinta-feira": 4, sexta: 5, "sexta-feira": 5,
    sabado: 6, "sábado": 6,
  };
  for (const [name, dow] of Object.entries(weekdays)) {
    if (text.includes(name)) {
      const d = new Date(today);
      const currentDow = d.getDay();
      let diff = dow - currentDow;
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      return d;
    }
  }

  return null;
}

function detectIntent(message: string): "greeting" | "cancel" | "exit" | null {
  const lower = message.toLowerCase().trim();
  const GREETING_INTENTS = ["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite", "menu", "começar", "comecar", "inicio", "início"];
  const CANCEL_INTENTS = ["cancelar", "desmarcar"];
  const EXIT_INTENTS = ["sair", "parar"];
  if (GREETING_INTENTS.some((g) => lower === g || lower.startsWith(g + " "))) return "greeting";
  if (CANCEL_INTENTS.some((c) => lower === c || lower.startsWith(c + " "))) return "cancel";
  if (EXIT_INTENTS.some((e) => lower === e)) return "exit";
  return null;
}

async function updateState(
  supabase: ReturnType<typeof getSupabase>,
  stateId: string,
  newState: string,
  context: Record<string, unknown>
) {
  await supabase
    .from("conversation_states")
    .update({
      current_state: newState,
      context,
      last_interaction_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    .eq("id", stateId);
}

// ─── Payment info ─────────────────────────────────────────────────────────────

async function sendPaymentInfoIfAvailable(
  supabase: ReturnType<typeof getSupabase>,
  tenantId: string,
  contactPhone: string,
  instanceToken: string,
  totalPrice: number
) {
  try {
    const { data: settings } = await supabase
      .from("settings")
      .select("pix_key, payment_link")
      .eq("tenant_id", tenantId)
      .single();

    if (!settings) return;
    const parts: string[] = [];
    if (settings.pix_key) parts.push(`*Chave PIX:* ${settings.pix_key}`);
    if (settings.payment_link) parts.push(`*Link de pagamento:* ${settings.payment_link}`);
    if (parts.length === 0) return;

    await sendText(
      contactPhone,
      `*Informacoes de pagamento*\nValor: R$ ${totalPrice.toFixed(2)}\n\n${parts.join("\n")}`,
      instanceToken
    );
  } catch { /* non-critical */ }
}

// ─── State handlers ──────────────────────────────────────────────────────────

async function handleMainMenu(
  ctx: BotContext,
  state: ConversationState,
  supabase: ReturnType<typeof getSupabase>
) {
  const { tenantId, contactPhone, contactName, instanceToken } = ctx;
  const { data: categories } = await supabase
    .from("service_categories")
    .select("id, name")
    .eq("tenant_id", tenantId);

  if (!categories || categories.length === 0) {
    await sendText(contactPhone, "Desculpe, nao ha servicos disponiveis no momento. Tente novamente mais tarde.", instanceToken);
    return;
  }

  const welcomeMsg = `👋 Ola, ${contactName}! Bem-vindo(a)!\n\nEscolha uma categoria de servico:`;

  if (categories.length <= 3) {
    await safeSendButtons(contactPhone, welcomeMsg, categories.map((c) => ({ id: `cat_${c.id}`, text: c.name })), instanceToken);
  } else {
    await safeSendList(contactPhone, welcomeMsg, "Selecione a categoria desejada", "Ver categorias", [{ title: "Categorias", rows: categories.map((c) => ({ id: `cat_${c.id}`, title: c.name })) }], instanceToken);
  }

  await updateState(supabase, state.id, "SELECTING_CATEGORY", { ...state.context });
}

async function handleAwaitingName(ctx: BotContext, state: ConversationState, message: string) {
  const supabase = getSupabase();
  const name = message.trim();
  if (name.length < 2) {
    await sendText(ctx.contactPhone, "Por favor, digite seu nome completo:", ctx.instanceToken);
    return;
  }
  await supabase.from("contacts").update({ name }).eq("id", ctx.contactId);
  ctx.contactName = name;
  await sendText(ctx.contactPhone, `Prazer, ${name}!`, ctx.instanceToken);

  const { data: companies } = await supabase.from("companies").select("id, name").eq("tenant_id", ctx.tenantId);
  if (companies && companies.length > 1) {
    const msg = `Em qual unidade voce deseja agendar?`;
    if (companies.length <= 3) {
      await safeSendButtons(ctx.contactPhone, msg, companies.map((c) => ({ id: `unit_${c.id}`, text: c.name })), ctx.instanceToken);
    } else {
      await safeSendList(ctx.contactPhone, msg, "Selecione a unidade", "Ver unidades", [{ title: "Unidades", rows: companies.map((c) => ({ id: `unit_${c.id}`, title: c.name })) }], ctx.instanceToken);
    }
    await updateState(supabase, state.id, "SELECTING_UNIT", {});
    return;
  }
  const unitId = companies?.[0]?.id;
  if (unitId) state.context = { ...state.context, unit_id: unitId };
  await handleMainMenu(ctx, state, supabase);
}

async function handleSelectingUnit(ctx: BotContext, state: ConversationState, message: string) {
  const supabase = getSupabase();
  const { tenantId, contactPhone, instanceToken } = ctx;
  let unitId = extractId(message, "unit_");

  if (!unitId) {
    const { data: companies } = await supabase.from("companies").select("id, name").eq("tenant_id", tenantId);
    const match = companies?.find((c) => c.name.toLowerCase() === message.toLowerCase().trim());
    if (match) unitId = match.id;
  }

  if (!unitId) {
    await sendText(contactPhone, "Nao entendi. Por favor, selecione uma das unidades disponiveis.", instanceToken);
    return;
  }
  state.context = { ...state.context, unit_id: unitId };
  await handleMainMenu(ctx, state, supabase);
}

async function handleMainMenuResponse(ctx: BotContext, state: ConversationState, message: string) {
  const supabase = getSupabase();
  const lowerMsg = message.toLowerCase().trim();

  if (lowerMsg === "btn_cancel_apt" || lowerMsg.includes("cancelar")) {
    const aptId = state.context.existingAppointmentId as string;
    if (aptId) {
      await supabase.from("appointments").update({ status: "cancelado" }).eq("id", aptId);
      await supabase.from("appointment_history").insert({ appointment_id: aptId, action: "canceled", reason: "Cancelado pelo cliente via WhatsApp", performed_by: "whatsapp_bot" });
      await sendText(ctx.contactPhone, "Agendamento cancelado com sucesso.", ctx.instanceToken);
      await updateState(supabase, state.id, "IDLE", {});
      return;
    }
  }

  if (lowerMsg === "btn_reschedule_apt" || lowerMsg.includes("reagendar")) {
    const aptId = state.context.existingAppointmentId as string;
    if (aptId) {
      const { data: apt } = await supabase
        .from("appointments")
        .select("*, appointment_services(service_id, services(id, name, category_id, duration_min, price))")
        .eq("id", aptId)
        .single();
      if (apt && apt.appointment_services?.[0]) {
        const svc = apt.appointment_services[0].services;
        await supabase.from("appointments").update({ status: "reagendado" }).eq("id", aptId);
        await sendText(ctx.contactPhone, "Vamos reagendar! Qual data voce prefere?\n\nVoce pode digitar:\n* *Hoje*\n* *Amanha*\n* Um dia (ex: 15)\n* Uma data (ex: 20/04)", ctx.instanceToken);
        await updateState(supabase, state.id, "AWAITING_DATE", { ...state.context, serviceId: svc.id, serviceName: svc.name, serviceDuration: svc.duration_min, servicePrice: svc.price, reschedulingFrom: aptId });
        return;
      }
    }
  }

  await handleMainMenu(ctx, state, supabase);
}

async function handleSelectingCategory(ctx: BotContext, state: ConversationState, message: string) {
  const supabase = getSupabase();
  const { tenantId, contactPhone, instanceToken } = ctx;
  let categoryId = extractId(message, "cat_");

  if (!categoryId) {
    const { data: categories } = await supabase.from("service_categories").select("id, name").eq("tenant_id", tenantId);
    const match = categories?.find((c) => c.name.toLowerCase() === message.toLowerCase().trim());
    if (match) categoryId = match.id;
  }

  if (!categoryId) {
    await sendText(contactPhone, "Nao entendi. Por favor, selecione uma das opcoes disponiveis.", instanceToken);
    return;
  }

  const { data: services } = await supabase.from("services").select("id, name, duration_min, price").eq("tenant_id", tenantId).eq("category_id", categoryId).eq("active", true);

  if (!services || services.length === 0) {
    await sendText(contactPhone, "Nenhum servico disponivel nesta categoria. Tente outra.", instanceToken);
    await handleMainMenu(ctx, state, supabase);
    return;
  }

  await safeSendList(contactPhone, "Escolha o servico desejado:", "Selecione o servico", "Ver servicos", [{ title: "Servicos", rows: services.map((s) => ({ id: `svc_${s.id}`, title: s.name, description: `${s.duration_min}min - R$ ${Number(s.price).toFixed(2)}` })) }], instanceToken);
  await updateState(supabase, state.id, "SELECTING_SERVICE", { ...state.context, categoryId });
}

async function handleSelectingService(ctx: BotContext, state: ConversationState, message: string) {
  const supabase = getSupabase();
  const { tenantId, contactPhone, instanceToken } = ctx;
  let serviceId = extractId(message, "svc_");

  if (!serviceId) {
    const categoryId = state.context.categoryId as string;
    const { data: services } = await supabase.from("services").select("id, name").eq("tenant_id", tenantId).eq("category_id", categoryId).eq("active", true);
    const match = services?.find((s) => s.name.toLowerCase() === message.toLowerCase().trim());
    if (match) serviceId = match.id;
  }

  if (!serviceId) {
    await sendText(contactPhone, "Nao entendi. Por favor, selecione um dos servicos disponiveis.", instanceToken);
    return;
  }

  const { data: service } = await supabase.from("services").select("id, name, duration_min, price").eq("id", serviceId).single();
  if (!service) {
    await sendText(contactPhone, "Servico nao encontrado. Tente novamente.", instanceToken);
    return;
  }

  await safeSendButtons(contactPhone, `*${service.name}* selecionado!\nDuracao: ${service.duration_min}min\nValor: R$ ${Number(service.price).toFixed(2)}\n\nQual data voce prefere?`, [{ id: "date_hoje", text: "Hoje" }, { id: "date_amanha", text: "Amanha" }, { id: "date_outra", text: "Outra data" }], instanceToken);
  await updateState(supabase, state.id, "AWAITING_DATE", { ...state.context, serviceId: service.id, serviceName: service.name, serviceDuration: service.duration_min, servicePrice: service.price });
}

async function handleAwaitingDate(ctx: BotContext, state: ConversationState, message: string) {
  const supabase = getSupabase();
  const { contactPhone, instanceToken } = ctx;
  const lowerMsg = message.toLowerCase().trim();

  let dateInput = lowerMsg;
  if (lowerMsg === "date_hoje") dateInput = "hoje";
  else if (lowerMsg === "date_amanha") dateInput = "amanhã";
  else if (lowerMsg === "date_outra") {
    await sendText(contactPhone, "Digite a data desejada:\n\n* Um dia (ex: *15*)\n* Uma data (ex: *20/04*)\n* Dia da semana (ex: *segunda*)", instanceToken);
    return;
  }

  const date = parseDate(dateInput);
  if (date) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const maxDate = new Date(now);
    maxDate.setDate(maxDate.getDate() + 60);
    if (date < now) {
      await sendText(contactPhone, "Esta data ja passou. Por favor, escolha uma data futura.", instanceToken);
      return;
    }
    if (date > maxDate) {
      await sendText(contactPhone, "So e possivel agendar ate 60 dias a frente. Tente uma data mais proxima.", instanceToken);
      return;
    }
  }

  if (!date) {
    await sendText(contactPhone, "Nao entendi a data. Tente:\n* *Hoje* ou *Amanha*\n* Um numero (ex: 15)\n* Uma data (ex: 20/04)\n* Dia da semana (ex: segunda)", instanceToken);
    return;
  }

  const serviceId = state.context.serviceId as string;
  const { data: professionals } = await supabase.from("professional_services").select("professional_id, professionals(id, name, active)").eq("service_id", serviceId);
  const activePros = professionals?.filter((p) => (p.professionals as unknown as { active: boolean })?.active) || [];

  if (activePros.length === 0) {
    await sendText(contactPhone, "Desculpe, nenhum profissional disponivel para este servico. Tente outro servico.", instanceToken);
    await updateState(supabase, state.id, "IDLE", {});
    return;
  }

  const dateStr = date.toISOString().split("T")[0];
  const proOptions = activePros.map((p) => {
    const prof = p.professionals as unknown as { id: string; name: string };
    return { id: prof.id, name: prof.name };
  });
  const allOptions = [{ id: "no_preference", name: "Sem preferencia" }, ...proOptions];

  if (allOptions.length <= 3) {
    await safeSendButtons(contactPhone, `Data: *${formatDate(date)}*\n\nEscolha o profissional:`, allOptions.map((o) => ({ id: o.id === "no_preference" ? "pro_no_preference" : `pro_${o.id}`, text: o.name })), instanceToken);
  } else {
    await safeSendList(contactPhone, `Data: *${formatDate(date)}*\n\nEscolha o profissional:`, "Selecione o profissional", "Ver profissionais", [{ title: "Profissionais", rows: allOptions.map((o) => ({ id: o.id === "no_preference" ? "pro_no_preference" : `pro_${o.id}`, title: o.name })) }], instanceToken);
  }

  await updateState(supabase, state.id, "SELECTING_PROFESSIONAL", { ...state.context, selectedDate: dateStr, availableProfessionals: proOptions });
}

async function handleSelectingProfessional(ctx: BotContext, state: ConversationState, message: string) {
  const supabase = getSupabase();
  const { tenantId, contactPhone, instanceToken } = ctx;
  const lowerMsg = message.toLowerCase().trim();
  let professionalId: string | null = null;
  let professionalName = "";

  const isNoPreference = lowerMsg === "pro_no_preference" || lowerMsg === "0" || lowerMsg === "sem preferencia" || lowerMsg === "sem preferência";

  if (isNoPreference) {
    const selectedDate = state.context.selectedDate as string;
    const availablePros = (state.context.availableProfessionals as Array<{ id: string; name: string }>) || [];
    if (availablePros.length === 0) { await sendText(contactPhone, "Nenhum profissional disponivel.", instanceToken); return; }

    const startOfDay = `${selectedDate}T00:00:00`;
    const endOfDay = `${selectedDate}T23:59:59`;
    let minCount = Infinity;
    let bestPro = availablePros[0];

    for (const pro of availablePros) {
      const { count } = await supabase.from("appointments").select("id", { count: "exact", head: true }).eq("professional_id", pro.id).gte("start_at", startOfDay).lte("start_at", endOfDay).in("status", ["pendente", "confirmado"]);
      const c = count ?? 0;
      if (c < minCount) { minCount = c; bestPro = pro; }
    }
    professionalId = bestPro.id;
    professionalName = bestPro.name;
  } else {
    professionalId = extractId(message, "pro_");
    if (!professionalId) {
      const serviceId = state.context.serviceId as string;
      const { data: profs } = await supabase.from("professional_services").select("professional_id, professionals(id, name)").eq("service_id", serviceId);
      const match = profs?.find((p) => (p.professionals as unknown as { name: string })?.name?.toLowerCase() === lowerMsg);
      if (match) {
        professionalId = (match.professionals as unknown as { id: string })?.id;
        professionalName = (match.professionals as unknown as { name: string })?.name;
      }
    }
    if (professionalId && !professionalName) {
      const { data: pro } = await supabase.from("professionals").select("name").eq("id", professionalId).single();
      professionalName = pro?.name || "";
    }
  }

  if (!professionalId) {
    await sendText(contactPhone, "Nao entendi. Por favor, selecione um dos profissionais disponiveis.", instanceToken);
    return;
  }

  const serviceId = state.context.serviceId as string;
  const selectedDate = state.context.selectedDate as string;

  const { data: slots } = await supabase.rpc("get_available_slots", { p_tenant_id: tenantId, p_professional_id: professionalId, p_service_id: serviceId, p_date: selectedDate });

  if (!slots || slots.length === 0) {
    await sendText(contactPhone, "Nenhum horario disponivel nesta data para este profissional.\n\nDeseja tentar outra data?", instanceToken);
    await safeSendButtons(contactPhone, "Escolha uma opcao:", [{ id: "date_hoje", text: "Hoje" }, { id: "date_amanha", text: "Amanha" }, { id: "date_outra", text: "Outra data" }], instanceToken);
    await updateState(supabase, state.id, "AWAITING_DATE", { ...state.context, selectedDate: undefined });
    return;
  }

  const slotsToShow = slots.slice(0, 10);
  await safeSendList(
    contactPhone,
    `Horarios disponiveis com *${professionalName}* em *${formatDate(new Date(selectedDate + "T12:00:00"))}*:`,
    "Selecione o horario",
    "Ver horarios",
    [{ title: "Horarios", rows: slotsToShow.map((s: { slot_start: string; slot_end: string }) => ({ id: `slot_${s.slot_start}`, title: formatTime(s.slot_start), description: `${formatTime(s.slot_start)} - ${formatTime(s.slot_end)}` })) }],
    instanceToken
  );

  await updateState(supabase, state.id, "SELECTING_SLOT", { ...state.context, professionalId, professionalName, availableSlots: slots });
}

async function handleSelectingSlot(ctx: BotContext, state: ConversationState, message: string) {
  const supabase = getSupabase();
  const { contactPhone, instanceToken } = ctx;
  let slotStart: string | null = null;

  if (message.startsWith("slot_")) {
    slotStart = message.replace("slot_", "");
  } else {
    const timeMatch = message.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const slots = (state.context.availableSlots as Array<{ slot_start: string }>) || [];
      const match = slots.find((s) => formatTime(s.slot_start) === `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`);
      if (match) slotStart = match.slot_start;
    }
  }

  if (!slotStart) {
    await sendText(contactPhone, "Nao entendi. Por favor, selecione um dos horarios disponiveis.", instanceToken);
    return;
  }

  const slots = (state.context.availableSlots as Array<{ slot_start: string; slot_end: string }>) || [];
  const selectedSlot = slots.find((s) => s.slot_start === slotStart);
  const slotEnd = selectedSlot?.slot_end || slotStart;

  const { serviceName, servicePrice, professionalName, selectedDate } = state.context as Record<string, string>;
  const summary = `*Confirme seu agendamento:*\n\nServico: *${serviceName}*\nProfissional: *${professionalName}*\nData: *${formatDate(new Date(selectedDate + "T12:00:00"))}*\nHorario: *${formatTime(slotStart)}*\nValor: *R$ ${Number(servicePrice).toFixed(2)}*\n\nDeseja confirmar?`;

  await safeSendButtons(contactPhone, summary, [{ id: "confirm_yes", text: "Confirmar" }, { id: "confirm_no", text: "Cancelar" }], instanceToken);
  await updateState(supabase, state.id, "CONFIRMING_BOOKING", { ...state.context, slotStart, slotEnd });
}

async function handleConfirmingBooking(ctx: BotContext, state: ConversationState, message: string) {
  const supabase = getSupabase();
  const { tenantId, contactId, contactPhone, instanceToken } = ctx;
  const lowerMsg = message.toLowerCase().trim();
  const isConfirm = lowerMsg === "confirm_yes" || lowerMsg.includes("sim") || lowerMsg.includes("confirmar") || lowerMsg.includes("confirmo");

  if (!isConfirm) {
    await sendText(contactPhone, "Agendamento cancelado. Digite *menu* para recomecar.", instanceToken);
    await updateState(supabase, state.id, "IDLE", {});
    return;
  }

  const { serviceId, servicePrice, professionalId, slotStart, slotEnd, unit_id } = state.context as Record<string, string>;
  let companyId = unit_id;
  if (!companyId) {
    const { data: pro } = await supabase.from("professionals").select("company_id").eq("id", professionalId).single();
    companyId = pro?.company_id;
  }

  const { data: appointment, error } = await supabase
    .from("appointments")
    .insert({ tenant_id: tenantId, company_id: companyId, contact_id: contactId, professional_id: professionalId, start_at: slotStart, end_at: slotEnd, status: "confirmado", total_price: Number(servicePrice), created_via: "whatsapp" })
    .select()
    .single();

  if (error || !appointment) {
    await sendText(contactPhone, "Ocorreu um erro ao criar o agendamento. Por favor, tente novamente.", instanceToken);
    await updateState(supabase, state.id, "IDLE", {});
    return;
  }

  await supabase.from("appointment_services").insert({ appointment_id: appointment.id, service_id: serviceId, price_at_time: Number(servicePrice) });
  await supabase.from("appointment_history").insert({ appointment_id: appointment.id, action: "created", new_state: { status: "confirmado" }, performed_by: "whatsapp_bot" });
  await supabase.from("contacts").update({ status: "agendado", last_appointment_at: slotStart }).eq("id", contactId);

  const { serviceName, professionalName } = state.context as Record<string, string>;
  await sendText(contactPhone, `*Agendamento confirmado!*\n\n${serviceName}\n${professionalName}\n${formatDate(new Date(slotStart))}\n${formatTime(slotStart)}\n\nAte la! 👋`, instanceToken);
  await sendPaymentInfoIfAvailable(supabase, tenantId, contactPhone, instanceToken, Number(servicePrice));
  await updateState(supabase, state.id, "IDLE", {});
}

// ─── Main processMessage ──────────────────────────────────────────────────────

async function processMessage(ctx: BotContext, message: string) {
  const supabase = getSupabase();
  const { tenantId, contactId, contactPhone, instanceToken } = ctx;

  // Test mode check
  const { data: settingsData } = await supabase.from("settings").select("test_mode, test_numbers").eq("tenant_id", tenantId).single();
  if (settingsData?.test_mode && Array.isArray(settingsData.test_numbers) && settingsData.test_numbers.length > 0) {
    const normalizedContact = contactPhone.replace(/\D/g, "").slice(-11);
    const isAllowed = settingsData.test_numbers.some((n: string) => n.replace(/\D/g, "").slice(-11) === normalizedContact);
    if (!isAllowed) {
      console.log(`WhatsApp bot: test mode active — blocked number ${contactPhone}`);
      return;
    }
  }

  // Get or create conversation state
  let { data: state } = await supabase.from("conversation_states").select("*").eq("tenant_id", tenantId).eq("contact_id", contactId).single();

  if (!state) {
    const { data: newState } = await supabase.from("conversation_states").insert({ tenant_id: tenantId, contact_id: contactId, current_state: "IDLE", context: {} }).select().single();
    state = newState;
  }

  if (!state) return;

  // Check expiry (30min)
  if (new Date(state.expires_at) < new Date()) {
    state.current_state = "IDLE";
    state.context = {};
  }

  const intent = detectIntent(message);

  if (intent === "greeting") {
    state.current_state = "IDLE";
    state.context = {};
  }

  if (intent === "cancel") {
    const { data: upcoming } = await supabase
      .from("appointments")
      .select("id, start_at, professionals(name), appointment_services(services(name))")
      .eq("tenant_id", tenantId)
      .eq("contact_id", contactId)
      .in("status", ["pendente", "confirmado"])
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .limit(1);

    if (upcoming && upcoming.length > 0) {
      const apt = upcoming[0];
      const svcEntry = apt.appointment_services?.[0] as unknown as { services: { name: string } } | undefined;
      const serviceName = svcEntry?.services?.name || "Servico";
      const profName = (apt.professionals as unknown as { name: string })?.name || "Profissional";
      await safeSendButtons(contactPhone, `Voce deseja cancelar o agendamento?\n\n${serviceName} com ${profName}\n${formatDate(new Date(apt.start_at))} as ${formatTime(apt.start_at)}`, [{ id: "btn_cancel_apt", text: "Sim, cancelar" }, { id: "btn_keep_apt", text: "Nao, manter" }], instanceToken);
      await updateState(supabase, state.id, "MAIN_MENU", { existingAppointmentId: apt.id });
      return;
    }
    await sendText(contactPhone, "Voce nao possui agendamentos futuros para cancelar.", instanceToken);
    await updateState(supabase, state.id, "IDLE", {});
    return;
  }

  if (intent === "exit") {
    await sendText(contactPhone, "Ate logo! Quando precisar, e so mandar mensagem. 👋", instanceToken);
    const pauseUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("conversation_states").update({ current_state: "PAUSED", context: { paused_until: pauseUntil }, last_interaction_at: new Date().toISOString(), expires_at: pauseUntil }).eq("id", state.id);
    return;
  }

  if (state.current_state === "PAUSED") {
    const pausedUntil = state.context.paused_until as string | undefined;
    if (pausedUntil && new Date(pausedUntil) > new Date()) return;
    state.current_state = "IDLE";
    state.context = {};
  }

  if (state.current_state === "IDLE") {
    const { data: upcoming } = await supabase
      .from("appointments")
      .select("*, professionals(name), appointment_services(services(name))")
      .eq("tenant_id", tenantId)
      .eq("contact_id", contactId)
      .in("status", ["pendente", "confirmado"])
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .limit(1);

    if (upcoming && upcoming.length > 0) {
      const apt = upcoming[0];
      const svcEntryIdle = apt.appointment_services?.[0] as unknown as { services: { name: string } } | undefined;
      const serviceName = svcEntryIdle?.services?.name || "Servico";
      const profName = (apt.professionals as unknown as { name: string })?.name || "Profissional";
      const dateStr = formatDate(new Date(apt.start_at));
      const timeStr = formatTime(apt.start_at);
      const msg = `👋 Ola, ${ctx.contactName}!\n\nVoce tem um agendamento:\n*${serviceName}*\nCom: ${profName}\n${dateStr} as ${timeStr}\n\nO que deseja fazer?`;
      await safeSendButtons(contactPhone, msg, [{ id: "btn_cancel_apt", text: "Cancelar" }, { id: "btn_reschedule_apt", text: "Reagendar" }, { id: "btn_new_apt", text: "Novo agendamento" }], instanceToken);
      await updateState(supabase, state.id, "MAIN_MENU", { existingAppointmentId: apt.id });
      return;
    }

    const isGenericName = ctx.contactName.startsWith("Cliente ") || ctx.contactName.length < 2;
    if (isGenericName) {
      await sendText(contactPhone, "👋 Ola! Antes de comecar, qual e o seu nome?", instanceToken);
      await updateState(supabase, state.id, "AWAITING_NAME", {});
      return;
    }

    const { data: companies } = await supabase.from("companies").select("id, name").eq("tenant_id", tenantId);
    if (companies && companies.length > 1) {
      const msg = `👋 Ola, ${ctx.contactName}! Bem-vindo(a)!\n\nEm qual unidade voce deseja agendar?`;
      if (companies.length <= 3) {
        await safeSendButtons(contactPhone, msg, companies.map((c) => ({ id: `unit_${c.id}`, text: c.name })), instanceToken);
      } else {
        await safeSendList(contactPhone, msg, "Selecione a unidade", "Ver unidades", [{ title: "Unidades", rows: companies.map((c) => ({ id: `unit_${c.id}`, title: c.name })) }], instanceToken);
      }
      await updateState(supabase, state.id, "SELECTING_UNIT", {});
      return;
    }

    const unitId = companies?.[0]?.id;
    if (unitId) state.context = { ...state.context, unit_id: unitId };
    await handleMainMenu(ctx, state, supabase);
    return;
  }

  const handlers: Record<string, (ctx: BotContext, state: ConversationState, message: string) => Promise<void>> = {
    AWAITING_NAME: handleAwaitingName,
    SELECTING_UNIT: handleSelectingUnit,
    MAIN_MENU: handleMainMenuResponse,
    SELECTING_CATEGORY: handleSelectingCategory,
    SELECTING_SERVICE: handleSelectingService,
    AWAITING_DATE: handleAwaitingDate,
    SELECTING_PROFESSIONAL: handleSelectingProfessional,
    SELECTING_SLOT: handleSelectingSlot,
    CONFIRMING_BOOKING: handleConfirmingBooking,
  };

  const handler = handlers[state.current_state];
  if (handler) {
    await handler(ctx, state, message);
  } else {
    await handleMainMenu(ctx, state, supabase);
  }
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Health check
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, server: "barberflow-edge-webhook" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Optional token validation
    const url = new URL(req.url);
    const webhookToken = url.searchParams.get("token") || req.headers.get("x-webhook-token");
    if (WEBHOOK_TOKEN && webhookToken !== WEBHOOK_TOKEN) {
      return new Response(JSON.stringify({ success: false, error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const supabase = getSupabase();

    // uazapi payload parsing
    const eventType: string = body?.EventType || body?.event || "";

    // Store debug info
    const debugSummary = JSON.stringify({
      at: new Date().toISOString(),
      eventType,
      bodyKeys: Object.keys(body),
      hasToken: !!body?.token,
      hasInstance: !!body?.instance,
      hasData: !!body?.data,
      dataKeys: body?.data ? Object.keys(body.data) : [],
    });

    const payloadToken: string | null = body?.token || null;
    const instance = body?.instance;
    const instanceId = typeof instance === "string" ? instance : (instance?.id || instance?.instanceId || body?.instanceId);

    // Store debug info on session (best-effort)
    try {
      if (payloadToken) {
        await supabase.from("whatsapp_sessions").update({ webhook_status: debugSummary }).eq("instance_token", payloadToken);
      } else if (instanceId) {
        await supabase.from("whatsapp_sessions").update({ webhook_status: debugSummary }).eq("instance_id", instanceId);
      }
    } catch { /* non-critical */ }

    if (eventType !== "messages" && eventType !== "message") {
      return new Response(JSON.stringify({ success: true, skipped: true, eventType }), { headers: { "Content-Type": "application/json" } });
    }

    const data = body?.data || {};
    const rawJid: string = data?.sender || data?.chatid || data?.from || data?.key?.remoteJid || "";
    const phone = rawJid.replace(/@s\.whatsapp\.net$/, "").replace(/@.*$/, "");
    const message: string = data?.text || data?.buttonOrListid || data?.message?.conversation || data?.message?.extendedTextMessage?.text || data?.message?.buttonsResponseMessage?.selectedButtonId || data?.message?.listResponseMessage?.singleSelectReply?.selectedRowId || "";
    const isFromMe: boolean = data?.fromMe ?? data?.key?.fromMe ?? false;
    const senderName: string = data?.senderName || data?.pushName || "";

    if (!phone || !message || isFromMe) {
      return new Response(JSON.stringify({ success: true, skipped: true, debug: { phone: !!phone, message: !!message, isFromMe } }), { headers: { "Content-Type": "application/json" } });
    }

    // Find tenant
    let tenantId: string | null = null;
    let instanceToken: string | null = null;
    let serviceActive = false;

    if (payloadToken) {
      const { data: session } = await supabase.from("whatsapp_sessions").select("tenant_id, instance_token, service_active").eq("instance_token", payloadToken).eq("status", "connected").single();
      if (session) { tenantId = session.tenant_id; instanceToken = session.instance_token; serviceActive = session.service_active ?? false; }
    }

    if (!tenantId && instanceId) {
      const { data: session } = await supabase.from("whatsapp_sessions").select("tenant_id, instance_token, service_active").eq("instance_id", instanceId).eq("status", "connected").single();
      if (session) { tenantId = session.tenant_id; instanceToken = session.instance_token; serviceActive = session.service_active ?? false; }
    }

    if (!tenantId) {
      const fallbackPhone = typeof instance === "object" ? (instance?.phone || body?.phone) : body?.phone;
      if (fallbackPhone) {
        const { data: session } = await supabase.from("whatsapp_sessions").select("tenant_id, instance_token, service_active").like("phone_number", `%${fallbackPhone.slice(-8)}`).eq("status", "connected").single();
        if (session) { tenantId = session.tenant_id; instanceToken = session.instance_token; serviceActive = session.service_active ?? false; }
      }
    }

    if (!tenantId || !instanceToken) {
      console.error("WhatsApp edge-function webhook: tenant not found", { instanceId, hasToken: !!payloadToken });
      return new Response(JSON.stringify({ success: false, error: "tenant_not_found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    // Find or create contact
    let { data: contact } = await supabase.from("contacts").select("id, name, phone").eq("tenant_id", tenantId).like("phone", `%${phone.slice(-8)}`).single();

    if (!contact) {
      const { data: newContact } = await supabase.from("contacts").insert({ tenant_id: tenantId, name: senderName || `Cliente ${phone.slice(-4)}`, phone, source: "whatsapp", status: "pendente" }).select("id, name, phone").single();
      contact = newContact;
    }

    if (!contact) {
      return new Response(JSON.stringify({ success: false, error: "contact_creation_failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    // Log inbound message
    await supabase.from("messages").insert({ tenant_id: tenantId, contact_id: contact.id, direction: "in", content: message });
    await supabase.from("contacts").update({ last_message_at: new Date().toISOString() }).eq("id", contact.id);

    if (!serviceActive) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "service_inactive" }), { headers: { "Content-Type": "application/json" } });
    }

    await processMessage(
      { tenantId, contactId: contact.id, contactName: contact.name, contactPhone: phone, instanceToken },
      message
    );

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("WhatsApp edge-function webhook error:", error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
