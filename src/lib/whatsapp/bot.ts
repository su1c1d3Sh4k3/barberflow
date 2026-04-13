import { createServiceRoleClient } from "@/lib/supabase/server";
import { uazapi } from "@/lib/uazapi/client";

// ============ TYPES ============

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

type StateHandler = (
  ctx: BotContext,
  state: ConversationState,
  message: string
) => Promise<void>;

// ============ INTENT DETECTION ============

const GREETING_INTENTS = [
  "oi", "olá", "ola", "bom dia", "boa tarde", "boa noite",
  "menu", "começar", "comecar", "inicio", "início",
];

const CANCEL_INTENTS = ["cancelar", "desmarcar"];

const EXIT_INTENTS = ["sair", "parar"];

function detectIntent(message: string): "greeting" | "cancel" | "exit" | null {
  const lower = message.toLowerCase().trim();
  if (GREETING_INTENTS.some((g) => lower === g || lower.startsWith(g + " "))) return "greeting";
  if (CANCEL_INTENTS.some((c) => lower === c || lower.startsWith(c + " "))) return "cancel";
  if (EXIT_INTENTS.some((e) => lower === e)) return "exit";
  return null;
}

// ============ DATE PARSER ============

function parseDate(input: string): Date | null {
  const text = input.toLowerCase().trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (text === "hoje" || text === "agora") {
    return today;
  }

  if (text === "amanhã" || text === "amanha") {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }

  // "depois de amanhã"
  if (text === "depois de amanhã" || text === "depois de amanha") {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return d;
  }

  // "daqui X dias" / "em X dias"
  const daqMatch = text.match(/(?:daqui|em)\s+(\d{1,2})\s+dias?/);
  if (daqMatch) {
    const days = parseInt(daqMatch[1]);
    if (days >= 1 && days <= 60) {
      const d = new Date(today);
      d.setDate(d.getDate() + days);
      return d;
    }
  }

  // "semana que vem" → next Monday
  if (text.includes("semana que vem") || text.includes("proxima semana") || text.includes("próxima semana")) {
    const d = new Date(today);
    const currentDow = d.getDay();
    const daysToMonday = currentDow === 0 ? 1 : 8 - currentDow;
    d.setDate(d.getDate() + daysToMonday);
    return d;
  }

  // DD/MM/YYYY
  const fullDateMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (fullDateMatch) {
    const day = parseInt(fullDateMatch[1]);
    const month = parseInt(fullDateMatch[2]) - 1;
    const year = parseInt(fullDateMatch[3]);
    return new Date(year, month, day);
  }

  // "dia X" or just a number
  const diaMatch = text.match(/^(?:dia\s+)?(\d{1,2})$/);
  if (diaMatch) {
    const day = parseInt(diaMatch[1]);
    if (day >= 1 && day <= 31) {
      const d = new Date(today.getFullYear(), today.getMonth(), day);
      if (d < today) d.setMonth(d.getMonth() + 1);
      return d;
    }
  }

  // DD/MM
  const ddmmMatch = text.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (ddmmMatch) {
    const day = parseInt(ddmmMatch[1]);
    const month = parseInt(ddmmMatch[2]) - 1;
    const d = new Date(today.getFullYear(), month, day);
    if (d < today) d.setFullYear(d.getFullYear() + 1);
    return d;
  }

  // Days of week
  const weekdays: Record<string, number> = {
    domingo: 0,
    segunda: 1,
    "segunda-feira": 1,
    terca: 2,
    "terça": 2,
    "terça-feira": 2,
    quarta: 3,
    "quarta-feira": 3,
    quinta: 4,
    "quinta-feira": 4,
    sexta: 5,
    "sexta-feira": 5,
    sabado: 6,
    "sábado": 6,
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

// ============ MAIN PROCESSOR ============

export async function processMessage(
  context: BotContext,
  message: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { tenantId, contactId, contactPhone, instanceToken } = context;

  // Get or create conversation state
  let { data: state } = await supabase
    .from("conversation_states")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("contact_id", contactId)
    .single();

  if (!state) {
    const { data: newState } = await supabase
      .from("conversation_states")
      .insert({
        tenant_id: tenantId,
        contact_id: contactId,
        current_state: "IDLE",
        context: {},
      })
      .select()
      .single();
    state = newState;
  }

  if (!state) return;

  // Check expiry (30min)
  const expired = new Date(state.expires_at) < new Date();
  if (expired) {
    state.current_state = "IDLE";
    state.context = {};
  }

  // ── Enhanced intent detection (before state-specific handling) ──
  const intent = detectIntent(message);

  if (intent === "greeting") {
    state.current_state = "IDLE";
    state.context = {};
  }

  if (intent === "cancel") {
    // Check if user has an upcoming appointment to cancel/manage
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

      await safeSendButtons(contactPhone, `Voce deseja cancelar o agendamento?\n\n${serviceName} com ${profName}\n${formatDate(new Date(apt.start_at))} as ${formatTime(apt.start_at)}`, [
        { id: "btn_cancel_apt", text: "Sim, cancelar" },
        { id: "btn_keep_apt", text: "Nao, manter" },
      ], instanceToken);

      await updateState(supabase, state.id, "MAIN_MENU", {
        existingAppointmentId: apt.id,
      });
      return;
    }

    await sendText(contactPhone, "Voce nao possui agendamentos futuros para cancelar.", instanceToken);
    await updateState(supabase, state.id, "IDLE", {});
    return;
  }

  if (intent === "exit") {
    await sendText(contactPhone, "Ate logo! Quando precisar, e so mandar mensagem. 👋", instanceToken);
    // Mark ia_enabled=false for 24h by setting expires_at far in the future
    // and current_state to PAUSED
    const pauseUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("conversation_states")
      .update({
        current_state: "PAUSED",
        context: { paused_until: pauseUntil },
        last_interaction_at: new Date().toISOString(),
        expires_at: pauseUntil,
      })
      .eq("id", state.id);
    return;
  }

  // If paused, check if pause period expired
  if (state.current_state === "PAUSED") {
    const pausedUntil = state.context.paused_until as string | undefined;
    if (pausedUntil && new Date(pausedUntil) > new Date()) {
      // Still paused — ignore message
      return;
    }
    // Pause expired, reset to IDLE
    state.current_state = "IDLE";
    state.context = {};
  }

  // Check for upcoming appointments on first interaction
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

      const msg = `👋 Ola, ${context.contactName}!\n\nVoce tem um agendamento:\n*${serviceName}*\nCom: ${profName}\n${dateStr} as ${timeStr}\n\nO que deseja fazer?`;

      await safeSendButtons(contactPhone, msg, [
        { id: "btn_cancel_apt", text: "Cancelar" },
        { id: "btn_reschedule_apt", text: "Reagendar" },
        { id: "btn_new_apt", text: "Novo agendamento" },
      ], instanceToken);

      await updateState(supabase, state.id, "MAIN_MENU", {
        existingAppointmentId: apt.id,
      });
      return;
    }

    // Check if contact needs name
    const isGenericName = context.contactName.startsWith("Cliente ") || context.contactName.length < 2;
    if (isGenericName) {
      await sendText(contactPhone, "👋 Ola! Antes de comecar, qual e o seu nome?", instanceToken);
      await updateState(supabase, state.id, "AWAITING_NAME", {});
      return;
    }

    // ── Multi-unit selection: if tenant has >1 company, ask which one ──
    const { data: companies } = await supabase
      .from("companies")
      .select("id, name")
      .eq("tenant_id", tenantId);

    if (companies && companies.length > 1) {
      const msg = `👋 Ola, ${context.contactName}! Bem-vindo(a)!\n\nEm qual unidade voce deseja agendar?`;

      if (companies.length <= 3) {
        await safeSendButtons(
          contactPhone,
          msg,
          companies.map((c) => ({ id: `unit_${c.id}`, text: c.name })),
          instanceToken
        );
      } else {
        await safeSendList(
          contactPhone,
          msg,
          "Selecione a unidade",
          "Ver unidades",
          [
            {
              title: "Unidades",
              rows: companies.map((c) => ({
                id: `unit_${c.id}`,
                title: c.name,
              })),
            },
          ],
          instanceToken
        );
      }

      await updateState(supabase, state.id, "SELECTING_UNIT", {});
      return;
    }

    // Single company or no multi-unit — store unit_id and proceed
    const unitId = companies?.[0]?.id;
    if (unitId) {
      state.context = { ...state.context, unit_id: unitId };
    }

    // No existing appointment - show welcome + categories
    await handleMainMenu(context, state, supabase);
    return;
  }

  // Route by state
  const handlers: Record<string, StateHandler> = {
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
    await handler(context, state, message);
  } else {
    // Unknown state, reset
    await handleMainMenu(context, state, supabase);
  }
}

// ============ STATE HANDLERS ============

async function handleSelectingUnit(
  ctx: BotContext,
  state: ConversationState,
  message: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { tenantId, contactPhone, instanceToken } = ctx;

  let unitId = extractId(message, "unit_");

  if (!unitId) {
    // Try matching by name
    const { data: companies } = await supabase
      .from("companies")
      .select("id, name")
      .eq("tenant_id", tenantId);

    const match = companies?.find(
      (c) => c.name.toLowerCase() === message.toLowerCase().trim()
    );
    if (match) unitId = match.id;
  }

  if (!unitId) {
    await sendText(contactPhone, "Nao entendi. Por favor, selecione uma das unidades disponiveis.", instanceToken);
    return;
  }

  // Store unit_id and proceed to categories
  state.context = { ...state.context, unit_id: unitId };
  await handleMainMenu(ctx, state, supabase);
}

async function handleMainMenu(
  ctx: BotContext,
  state: ConversationState,
  supabase: ReturnType<typeof createServiceRoleClient>
): Promise<void> {
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
    await safeSendButtons(
      contactPhone,
      welcomeMsg,
      categories.map((c) => ({ id: `cat_${c.id}`, text: c.name })),
      instanceToken
    );
  } else {
    await safeSendList(
      contactPhone,
      welcomeMsg,
      "Selecione a categoria desejada",
      "Ver categorias",
      [
        {
          title: "Categorias",
          rows: categories.map((c) => ({
            id: `cat_${c.id}`,
            title: c.name,
          })),
        },
      ],
      instanceToken
    );
  }

  await updateState(supabase, state.id, "SELECTING_CATEGORY", {
    ...state.context,
  });
}

async function handleMainMenuResponse(
  ctx: BotContext,
  state: ConversationState,
  message: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  const lowerMsg = message.toLowerCase().trim();

  // Handle button responses for existing appointment
  if (lowerMsg === "btn_cancel_apt" || lowerMsg.includes("cancelar")) {
    const aptId = state.context.existingAppointmentId as string;
    if (aptId) {
      await supabase
        .from("appointments")
        .update({ status: "cancelado" })
        .eq("id", aptId);

      await supabase.from("appointment_history").insert({
        appointment_id: aptId,
        action: "canceled",
        reason: "Cancelado pelo cliente via WhatsApp",
        performed_by: "whatsapp_bot",
      });

      await sendText(ctx.contactPhone, "Agendamento cancelado com sucesso.", ctx.instanceToken);
      await updateState(supabase, state.id, "IDLE", {});
      return;
    }
  }

  if (lowerMsg === "btn_reschedule_apt" || lowerMsg.includes("reagendar")) {
    const aptId = state.context.existingAppointmentId as string;
    if (aptId) {
      // Get appointment service to restart booking flow
      const { data: apt } = await supabase
        .from("appointments")
        .select("*, appointment_services(service_id, services(id, name, category_id, duration_min, price))")
        .eq("id", aptId)
        .single();

      if (apt && apt.appointment_services?.[0]) {
        const svc = apt.appointment_services[0].services;
        await supabase
          .from("appointments")
          .update({ status: "reagendado" })
          .eq("id", aptId);

        await sendText(ctx.contactPhone, "Vamos reagendar! Qual data voce prefere?\n\nVoce pode digitar:\n* *Hoje*\n* *Amanha*\n* Um dia (ex: 15)\n* Uma data (ex: 20/04)", ctx.instanceToken);

        await updateState(supabase, state.id, "AWAITING_DATE", {
          ...state.context,
          serviceId: svc.id,
          serviceName: svc.name,
          serviceDuration: svc.duration_min,
          servicePrice: svc.price,
          reschedulingFrom: aptId,
        });
        return;
      }
    }
  }

  // "Novo agendamento" or unrecognized - show categories
  await handleMainMenu(ctx, state, supabase);
}

async function handleSelectingCategory(
  ctx: BotContext,
  state: ConversationState,
  message: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { tenantId, contactPhone, instanceToken } = ctx;

  // Extract category ID from button response or text
  let categoryId = extractId(message, "cat_");

  if (!categoryId) {
    // Try matching by name
    const { data: categories } = await supabase
      .from("service_categories")
      .select("id, name")
      .eq("tenant_id", tenantId);

    const match = categories?.find(
      (c) => c.name.toLowerCase() === message.toLowerCase().trim()
    );
    if (match) categoryId = match.id;
  }

  if (!categoryId) {
    await sendText(contactPhone, "Nao entendi. Por favor, selecione uma das opcoes disponiveis.", instanceToken);
    return;
  }

  // Fetch services in this category
  const { data: services } = await supabase
    .from("services")
    .select("id, name, duration_min, price")
    .eq("tenant_id", tenantId)
    .eq("category_id", categoryId)
    .eq("active", true);

  if (!services || services.length === 0) {
    await sendText(contactPhone, "Nenhum servico disponivel nesta categoria. Tente outra.", instanceToken);
    await handleMainMenu(ctx, state, supabase);
    return;
  }

  const msg = "Escolha o servico desejado:";

  await safeSendList(
    contactPhone,
    msg,
    "Selecione o servico",
    "Ver servicos",
    [
      {
        title: "Servicos",
        rows: services.map((s) => ({
          id: `svc_${s.id}`,
          title: s.name,
          description: `${s.duration_min}min - R$ ${Number(s.price).toFixed(2)}`,
        })),
      },
    ],
    instanceToken
  );

  await updateState(supabase, state.id, "SELECTING_SERVICE", {
    ...state.context,
    categoryId,
  });
}

async function handleSelectingService(
  ctx: BotContext,
  state: ConversationState,
  message: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { tenantId, contactPhone, instanceToken } = ctx;

  let serviceId = extractId(message, "svc_");

  if (!serviceId) {
    const categoryId = state.context.categoryId as string;
    const { data: services } = await supabase
      .from("services")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("category_id", categoryId)
      .eq("active", true);

    const match = services?.find(
      (s) => s.name.toLowerCase() === message.toLowerCase().trim()
    );
    if (match) serviceId = match.id;
  }

  if (!serviceId) {
    await sendText(contactPhone, "Nao entendi. Por favor, selecione um dos servicos disponiveis.", instanceToken);
    return;
  }

  // Get service details
  const { data: service } = await supabase
    .from("services")
    .select("id, name, duration_min, price")
    .eq("id", serviceId)
    .single();

  if (!service) {
    await sendText(contactPhone, "Servico nao encontrado. Tente novamente.", instanceToken);
    return;
  }

  await safeSendButtons(
    contactPhone,
    `*${service.name}* selecionado!\nDuracao: ${service.duration_min}min\nValor: R$ ${Number(service.price).toFixed(2)}\n\nQual data voce prefere?`,
    [
      { id: "date_hoje", text: "Hoje" },
      { id: "date_amanha", text: "Amanha" },
      { id: "date_outra", text: "Outra data" },
    ],
    instanceToken
  );

  await updateState(supabase, state.id, "AWAITING_DATE", {
    ...state.context,
    serviceId: service.id,
    serviceName: service.name,
    serviceDuration: service.duration_min,
    servicePrice: service.price,
  });
}

async function handleAwaitingDate(
  ctx: BotContext,
  state: ConversationState,
  message: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { contactPhone, instanceToken } = ctx;

  const lowerMsg = message.toLowerCase().trim();

  // Handle button ids
  let dateInput = lowerMsg;
  if (lowerMsg === "date_hoje") dateInput = "hoje";
  else if (lowerMsg === "date_amanha") dateInput = "amanhã";
  else if (lowerMsg === "date_outra") {
    await sendText(contactPhone, "Digite a data desejada:\n\n* Um dia (ex: *15*)\n* Uma data (ex: *20/04*)\n* Dia da semana (ex: *segunda*)", instanceToken);
    return;
  }

  const date = parseDate(dateInput);

  // Validate date range
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

  // Find professionals that offer this service
  const { data: professionals } = await supabase
    .from("professional_services")
    .select("professional_id, professionals(id, name, active)")
    .eq("service_id", serviceId);

  const activePros = professionals?.filter(
    (p) => (p.professionals as unknown as { active: boolean })?.active
  ) || [];

  if (activePros.length === 0) {
    await sendText(contactPhone, "Desculpe, nenhum profissional disponivel para este servico. Tente outro servico.", instanceToken);
    await updateState(supabase, state.id, "IDLE", {});
    return;
  }

  const dateStr = date.toISOString().split("T")[0];

  // ── "Sem preferencia" option as first ──
  const proOptions = activePros.map((p) => {
    const prof = p.professionals as unknown as { id: string; name: string };
    return { id: prof.id, name: prof.name };
  });

  // Build options: "0" for no preference + actual professionals
  const allOptions = [
    { id: "no_preference", name: "Sem preferencia" },
    ...proOptions,
  ];

  if (allOptions.length <= 3) {
    const msg = `Data: *${formatDate(date)}*\n\nEscolha o profissional:`;
    await safeSendButtons(
      contactPhone,
      msg,
      allOptions.map((o) => ({
        id: o.id === "no_preference" ? "pro_no_preference" : `pro_${o.id}`,
        text: o.name,
      })),
      instanceToken
    );
  } else {
    await safeSendList(
      contactPhone,
      `Data: *${formatDate(date)}*\n\nEscolha o profissional:`,
      "Selecione o profissional",
      "Ver profissionais",
      [
        {
          title: "Profissionais",
          rows: allOptions.map((o) => ({
            id: o.id === "no_preference" ? "pro_no_preference" : `pro_${o.id}`,
            title: o.name,
          })),
        },
      ],
      instanceToken
    );
  }

  await updateState(supabase, state.id, "SELECTING_PROFESSIONAL", {
    ...state.context,
    selectedDate: dateStr,
    availableProfessionals: proOptions,
  });
}

async function handleSelectingProfessional(
  ctx: BotContext,
  state: ConversationState,
  message: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { tenantId, contactPhone, instanceToken } = ctx;

  const lowerMsg = message.toLowerCase().trim();
  let professionalId: string | null = null;
  let professionalName = "";

  // Check for "sem preferencia" / "0" / button id
  const isNoPreference =
    lowerMsg === "pro_no_preference" ||
    lowerMsg === "0" ||
    lowerMsg === "sem preferencia" ||
    lowerMsg === "sem preferência";

  if (isNoPreference) {
    // Load-balance: pick the professional with fewest appointments on that day
    const selectedDate = state.context.selectedDate as string;
    const availablePros = (state.context.availableProfessionals as Array<{ id: string; name: string }>) || [];

    if (availablePros.length === 0) {
      await sendText(contactPhone, "Nenhum profissional disponivel.", instanceToken);
      return;
    }

    // Count appointments per professional for the selected date
    const startOfDay = `${selectedDate}T00:00:00`;
    const endOfDay = `${selectedDate}T23:59:59`;

    let minCount = Infinity;
    let bestPro = availablePros[0];

    for (const pro of availablePros) {
      const { count } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("professional_id", pro.id)
        .gte("start_at", startOfDay)
        .lte("start_at", endOfDay)
        .in("status", ["pendente", "confirmado"]);

      const c = count ?? 0;
      if (c < minCount) {
        minCount = c;
        bestPro = pro;
      }
    }

    professionalId = bestPro.id;
    professionalName = bestPro.name;
  } else {
    professionalId = extractId(message, "pro_");

    if (!professionalId) {
      // Try matching by name
      const serviceId = state.context.serviceId as string;
      const { data: professionals } = await supabase
        .from("professional_services")
        .select("professional_id, professionals(id, name)")
        .eq("service_id", serviceId);

      const match = professionals?.find(
        (p) =>
          (p.professionals as unknown as { name: string })?.name?.toLowerCase() ===
          lowerMsg
      );
      if (match) {
        professionalId = (match.professionals as unknown as { id: string })?.id;
        professionalName = (match.professionals as unknown as { name: string })?.name;
      }
    }

    if (professionalId && !professionalName) {
      const { data: pro } = await supabase
        .from("professionals")
        .select("name")
        .eq("id", professionalId)
        .single();
      professionalName = pro?.name || "";
    }
  }

  if (!professionalId) {
    await sendText(contactPhone, "Nao entendi. Por favor, selecione um dos profissionais disponiveis.", instanceToken);
    return;
  }

  const serviceId = state.context.serviceId as string;
  const selectedDate = state.context.selectedDate as string;

  // Get available slots
  const { data: slots } = await supabase.rpc("get_available_slots", {
    p_tenant_id: tenantId,
    p_professional_id: professionalId,
    p_service_id: serviceId,
    p_date: selectedDate,
  });

  if (!slots || slots.length === 0) {
    await sendText(contactPhone, "Nenhum horario disponivel nesta data para este profissional.\n\nDeseja tentar outra data?", instanceToken);
    await safeSendButtons(
      contactPhone,
      "Escolha uma opcao:",
      [
        { id: "date_hoje", text: "Hoje" },
        { id: "date_amanha", text: "Amanha" },
        { id: "date_outra", text: "Outra data" },
      ],
      instanceToken
    );
    await updateState(supabase, state.id, "AWAITING_DATE", {
      ...state.context,
      selectedDate: undefined,
    });
    return;
  }

  // Show available slots (limit to 10 for usability)
  const slotsToShow = slots.slice(0, 10);

  await safeSendList(
    contactPhone,
    `Horarios disponiveis com *${professionalName}* em *${formatDate(new Date(selectedDate + "T12:00:00"))}*:`,
    "Selecione o horario",
    "Ver horarios",
    [
      {
        title: "Horarios",
        rows: slotsToShow.map((s: { slot_start: string; slot_end: string }) => ({
          id: `slot_${s.slot_start}`,
          title: formatTime(s.slot_start),
          description: `${formatTime(s.slot_start)} - ${formatTime(s.slot_end)}`,
        })),
      },
    ],
    instanceToken
  );

  await updateState(supabase, state.id, "SELECTING_SLOT", {
    ...state.context,
    professionalId,
    professionalName,
    availableSlots: slots,
  });
}

async function handleSelectingSlot(
  ctx: BotContext,
  state: ConversationState,
  message: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { contactPhone, instanceToken } = ctx;

  let slotStart: string | null = null;

  // Try to extract from button id
  if (message.startsWith("slot_")) {
    slotStart = message.replace("slot_", "");
  } else {
    // Try to match by time (HH:MM)
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

  // Find corresponding slot_end
  const slots = (state.context.availableSlots as Array<{ slot_start: string; slot_end: string }>) || [];
  const selectedSlot = slots.find((s) => s.slot_start === slotStart);
  const slotEnd = selectedSlot?.slot_end || slotStart;

  const serviceName = state.context.serviceName as string;
  const servicePrice = state.context.servicePrice as number;
  const professionalName = state.context.professionalName as string;
  const selectedDate = state.context.selectedDate as string;

  const summary = `*Confirme seu agendamento:*\n\nServico: *${serviceName}*\nProfissional: *${professionalName}*\nData: *${formatDate(new Date(selectedDate + "T12:00:00"))}*\nHorario: *${formatTime(slotStart)}*\nValor: *R$ ${Number(servicePrice).toFixed(2)}*\n\nDeseja confirmar?`;

  await safeSendButtons(
    contactPhone,
    summary,
    [
      { id: "confirm_yes", text: "Confirmar" },
      { id: "confirm_no", text: "Cancelar" },
    ],
    instanceToken
  );

  await updateState(supabase, state.id, "CONFIRMING_BOOKING", {
    ...state.context,
    slotStart,
    slotEnd,
  });
}

async function handleConfirmingBooking(
  ctx: BotContext,
  state: ConversationState,
  message: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { tenantId, contactId, contactPhone, instanceToken } = ctx;
  const lowerMsg = message.toLowerCase().trim();

  const isConfirm =
    lowerMsg === "confirm_yes" ||
    lowerMsg.includes("sim") ||
    lowerMsg.includes("confirmar") ||
    lowerMsg.includes("confirmo");

  if (!isConfirm) {
    await sendText(contactPhone, "Agendamento cancelado. Digite *menu* para recomecar.", instanceToken);
    await updateState(supabase, state.id, "IDLE", {});
    return;
  }

  const {
    serviceId,
    servicePrice,
    professionalId,
    slotStart,
    slotEnd,
    unit_id,
  } = state.context as Record<string, string>;

  // Get company for this professional (or use selected unit)
  let companyId = unit_id;
  if (!companyId) {
    const { data: pro } = await supabase
      .from("professionals")
      .select("company_id")
      .eq("id", professionalId)
      .single();
    companyId = pro?.company_id;
  }

  // Create appointment
  const { data: appointment, error } = await supabase
    .from("appointments")
    .insert({
      tenant_id: tenantId,
      company_id: companyId,
      contact_id: contactId,
      professional_id: professionalId,
      start_at: slotStart,
      end_at: slotEnd,
      status: "confirmado",
      total_price: Number(servicePrice),
      created_via: "whatsapp",
    })
    .select()
    .single();

  if (error || !appointment) {
    await sendText(contactPhone, "Ocorreu um erro ao criar o agendamento. Por favor, tente novamente.", instanceToken);
    await updateState(supabase, state.id, "IDLE", {});
    return;
  }

  // Add appointment services
  await supabase.from("appointment_services").insert({
    appointment_id: appointment.id,
    service_id: serviceId,
    price_at_time: Number(servicePrice),
  });

  // Add history
  await supabase.from("appointment_history").insert({
    appointment_id: appointment.id,
    action: "created",
    new_state: { status: "confirmado" },
    performed_by: "whatsapp_bot",
  });

  // Update contact
  await supabase
    .from("contacts")
    .update({
      status: "agendado",
      last_appointment_at: slotStart,
    })
    .eq("id", contactId);

  const serviceName = state.context.serviceName as string;
  const professionalName = state.context.professionalName as string;

  await sendText(
    contactPhone,
    `*Agendamento confirmado!*\n\n${serviceName}\n${professionalName}\n${formatDate(new Date(slotStart))}\n${formatTime(slotStart)}\n\nAte la! 👋`,
    instanceToken
  );

  // ── Payment info after booking ──
  await sendPaymentInfoIfAvailable(supabase, tenantId, contactPhone, instanceToken, Number(servicePrice));

  await updateState(supabase, state.id, "IDLE", {});
}

async function handleAwaitingName(
  ctx: BotContext,
  state: ConversationState,
  message: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  const name = message.trim();

  if (name.length < 2) {
    await sendText(ctx.contactPhone, "Por favor, digite seu nome completo:", ctx.instanceToken);
    return;
  }

  // Update contact name
  await supabase
    .from("contacts")
    .update({ name })
    .eq("id", ctx.contactId);

  // Update context name
  ctx.contactName = name;

  await sendText(ctx.contactPhone, `Prazer, ${name}!`, ctx.instanceToken);

  // Check for multi-unit before showing main menu
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name")
    .eq("tenant_id", ctx.tenantId);

  if (companies && companies.length > 1) {
    const msg = `Em qual unidade voce deseja agendar?`;

    if (companies.length <= 3) {
      await safeSendButtons(
        ctx.contactPhone,
        msg,
        companies.map((c) => ({ id: `unit_${c.id}`, text: c.name })),
        ctx.instanceToken
      );
    } else {
      await safeSendList(
        ctx.contactPhone,
        msg,
        "Selecione a unidade",
        "Ver unidades",
        [
          {
            title: "Unidades",
            rows: companies.map((c) => ({
              id: `unit_${c.id}`,
              title: c.name,
            })),
          },
        ],
        ctx.instanceToken
      );
    }

    await updateState(supabase, state.id, "SELECTING_UNIT", {});
    return;
  }

  // Single company
  const unitId = companies?.[0]?.id;
  if (unitId) {
    state.context = { ...state.context, unit_id: unitId };
  }

  // Show main menu
  await handleMainMenu(ctx, state, supabase);
}

// ============ PAYMENT INFO ============

async function sendPaymentInfoIfAvailable(
  supabase: ReturnType<typeof createServiceRoleClient>,
  tenantId: string,
  contactPhone: string,
  instanceToken: string,
  totalPrice: number
): Promise<void> {
  try {
    const { data: settings } = await supabase
      .from("settings")
      .select("pix_key, payment_link")
      .eq("tenant_id", tenantId)
      .single();

    if (!settings) return;

    const parts: string[] = [];

    if (settings.pix_key) {
      parts.push(`*Chave PIX:* ${settings.pix_key}`);
    }
    if (settings.payment_link) {
      parts.push(`*Link de pagamento:* ${settings.payment_link}`);
    }

    if (parts.length === 0) return;

    const msg = `*Informacoes de pagamento*\nValor: R$ ${totalPrice.toFixed(2)}\n\n${parts.join("\n")}`;
    await sendText(contactPhone, msg, instanceToken);
  } catch {
    // Non-critical — don't fail the booking
  }
}

// ============ HELPERS ============

async function safeSendButtons(
  phone: string,
  text: string,
  buttons: Array<{ id: string; text: string }>,
  token: string
): Promise<void> {
  try {
    await uazapi.sendButtons(phone, text, buttons, token);
  } catch (err) {
    // Fallback to plain text if buttons fail
    console.error("Failed to send WhatsApp buttons:", err);
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
): Promise<void> {
  try {
    await uazapi.sendList(phone, text, title, buttonText, sections, token);
  } catch (err) {
    // Fallback to plain text if list fails
    console.error("Failed to send WhatsApp list:", err);
    const rows = sections.flatMap((s) => s.rows);
    const fallback = text + "\n\n" + rows.map((r, i) => `${i + 1}. ${r.title}${r.description ? ` (${r.description})` : ""}`).join("\n");
    await sendText(phone, fallback, token);
  }
}

function extractId(message: string, prefix: string): string | null {
  const msg = message.trim();
  if (msg.startsWith(prefix)) {
    return msg.replace(prefix, "");
  }
  return null;
}

async function sendText(
  phone: string,
  message: string,
  token: string
): Promise<void> {
  try {
    await uazapi.sendText(phone, message, token);
  } catch (err) {
    console.error("Failed to send WhatsApp text:", err);
  }
}

async function updateState(
  supabase: ReturnType<typeof createServiceRoleClient>,
  stateId: string,
  newState: string,
  context: Record<string, unknown>
): Promise<void> {
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
