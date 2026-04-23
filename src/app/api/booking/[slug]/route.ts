import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

// UUID v4 regex
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalize phone to digits-only + Brazil country code (55).
 * Ensures consistent storage regardless of how the user typed the number.
 * Examples:
 *   "(11) 99999-9999"  → "5511999999999"
 *   "11999999999"      → "5511999999999"
 *   "5511999999999"    → "5511999999999"
 *   "+55 11 99999-9999"→ "5511999999999"
 */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // Already has country code 55 and at least 12 digits
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  // 10-11 digit number without country code → add 55
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}

/**
 * Find a contact by matching the last 8 digits of the phone.
 * Returns the best match: exact normalized match first, then any suffix match.
 * This prevents duplicate contacts when phones are stored with/without country code.
 */
async function findContactByPhone(
  supabase: ReturnType<typeof createServiceRoleClient>,
  tenantId: string,
  phone: string
) {
  const normalized = normalizePhone(phone);
  const last8 = normalized.slice(-8);

  const { data: matches } = await supabase
    .from("contacts")
    .select("id, name, phone")
    .eq("tenant_id", tenantId)
    .like("phone", `%${last8}`)
    .limit(10);

  if (!matches || matches.length === 0) return null;
  // Prefer exact normalized match; fall back to first suffix match
  return matches.find((c) => normalizePhone(c.phone || "") === normalized) ?? matches[0];
}

// Resolve slug → tenant_id + company_id
async function resolveTenant(supabase: ReturnType<typeof createServiceRoleClient>, slug: string) {
  // Try tenant slug first
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("public_slug", slug)
    .single();

  if (tenant) {
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("is_default", true)
      .single();
    return { tenant_id: tenant.id, company_id: company?.id };
  }

  // Try company slug
  const { data: company } = await supabase
    .from("companies")
    .select("id, tenant_id")
    .eq("public_slug", slug)
    .single();

  if (company) {
    return { tenant_id: company.tenant_id, company_id: company.id };
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const supabase = createServiceRoleClient();
  const { searchParams } = request.nextUrl;
  const step = searchParams.get("step");
  const { slug } = await params;

  const resolved = await resolveTenant(supabase, slug);
  if (!resolved) {
    return json({ error: "Barbearia não encontrada" }, 404);
  }

  const { tenant_id } = resolved;

  const { company_id } = resolved;

  // ============ CATEGORIES ============
  if (step === "categories") {
    // If company resolved, filter to categories with services available at that company
    let categoryIds: string[] | null = null;
    if (company_id) {
      const { data: profs } = await supabase
        .from("professionals")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("company_id", company_id)
        .eq("active", true);

      const profIds = (profs || []).map((p: { id: string }) => p.id);
      if (profIds.length > 0) {
        const { data: ps } = await supabase
          .from("professional_services")
          .select("service_id")
          .in("professional_id", profIds);

        if (ps && ps.length > 0) {
          const svcIds = ps.map((r: { service_id: string }) => r.service_id);
          const { data: svcs } = await supabase
            .from("services")
            .select("category_id")
            .in("id", svcIds)
            .eq("active", true);

          const seen: Record<string, boolean> = {};
          categoryIds = (svcs || [])
            .map((s: { category_id: string }) => s.category_id)
            .filter((id: string) => { if (!id || seen[id]) return false; seen[id] = true; return true; });
        } else {
          categoryIds = [];
        }
      } else {
        categoryIds = [];
      }
    }

    let catQuery = supabase
      .from("service_categories")
      .select("id, name, description, color")
      .eq("tenant_id", tenant_id)
      .order("name");

    if (categoryIds !== null && categoryIds.length > 0) {
      catQuery = catQuery.in("id", categoryIds);
    } else if (categoryIds !== null && categoryIds.length === 0) {
      return json({ categories: [] });
    }

    const { data: categories, error } = await catQuery;
    if (error) return json({ error: error.message }, 500);
    return json({ categories });
  }

  // ============ SERVICES ============
  if (step === "services") {
    const categoryId = searchParams.get("category_id");
    if (!categoryId) return json({ error: "category_id obrigatório" }, 400);

    // If company resolved, filter to services linked to professionals at that company
    let allowedSvcIds: string[] | null = null;
    if (company_id) {
      const { data: profs } = await supabase
        .from("professionals")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("company_id", company_id)
        .eq("active", true);

      const profIds = (profs || []).map((p: { id: string }) => p.id);
      if (profIds.length > 0) {
        const { data: ps } = await supabase
          .from("professional_services")
          .select("service_id")
          .in("professional_id", profIds);

        const seen: Record<string, boolean> = {};
        allowedSvcIds = (ps || [])
          .map((r: { service_id: string }) => r.service_id)
          .filter((id: string) => { if (seen[id]) return false; seen[id] = true; return true; });
      } else {
        allowedSvcIds = [];
      }
    }

    let svcQuery = supabase
      .from("services")
      .select("id, name, description, duration_min, price, promo_active, promo_discount_pct")
      .eq("tenant_id", tenant_id)
      .eq("category_id", categoryId)
      .eq("active", true)
      .order("name");

    if (allowedSvcIds !== null) {
      if (allowedSvcIds.length === 0) return json({ services: [] });
      svcQuery = svcQuery.in("id", allowedSvcIds);
    }

    const { data: services, error } = await svcQuery;
    if (error) return json({ error: error.message }, 500);
    return json({ services });
  }

  // ============ PROFESSIONALS ============
  if (step === "professionals") {
    const serviceId = searchParams.get("service_id");
    if (!serviceId) return json({ error: "service_id obrigatório" }, 400);

    // Get professionals linked to this service
    const { data: links } = await supabase
      .from("professional_services")
      .select("professional_id")
      .eq("service_id", serviceId);

    const proIds = links?.map((l: { professional_id: string }) => l.professional_id) || [];

    let profQuery = supabase
      .from("professionals")
      .select("id, name, avatar_url, bio")
      .eq("active", true)
      .order("name");

    // Filter by company if resolved
    if (company_id) profQuery = profQuery.eq("company_id", company_id);

    if (proIds.length > 0) {
      profQuery = profQuery.in("id", proIds);
    } else {
      // No service links — filter by company only (fallback)
      profQuery = profQuery.eq("tenant_id", tenant_id);
    }

    const { data: professionals, error } = await profQuery;
    if (error) return json({ error: error.message }, 500);
    return json({ professionals });
  }

  // ============ TIME SLOTS ============
  if (step === "slots") {
    const professionalId = searchParams.get("professional_id");
    const serviceId = searchParams.get("service_id");
    const date = searchParams.get("date");

    if (!professionalId || !serviceId || !date) {
      return json({ error: "professional_id, service_id e date obrigatórios" }, 400);
    }

    const { data: slots, error } = await supabase.rpc("get_available_slots", {
      p_tenant_id: tenant_id,
      p_professional_id: professionalId,
      p_service_id: serviceId,
      p_date: date,
    });

    if (error) return json({ error: error.message }, 500);
    return json({ slots: slots || [] });
  }

  // ============ CHECK PHONE ============
  if (step === "check_phone") {
    const phone = searchParams.get("phone");
    if (!phone) return json({ error: "phone obrigatório" }, 400);

    const contact = await findContactByPhone(supabase, tenant_id, phone);

    if (!contact) return json({ appointments: [] });

    const { data: appointments } = await supabase
      .from("appointments")
      .select("id, start_at, end_at, status, appointment_services(services(name)), professionals(name)")
      .eq("tenant_id", tenant_id)
      .eq("contact_id", contact.id)
      .in("status", ["pendente", "confirmado"])
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .limit(5);

    return json({ contact: { id: contact.id, name: contact.name }, appointments: appointments || [] });
  }

  return json({ error: "step inválido" }, 400);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const supabase = createServiceRoleClient();
  const { searchParams } = request.nextUrl;
  const step = searchParams.get("step");
  const { slug } = await params;

  if (step !== "book" && step !== "cancel" && step !== "reschedule") {
    return json({ error: "step inválido" }, 400);
  }

  const resolved = await resolveTenant(supabase, slug);
  if (!resolved) {
    return json({ error: "Barbearia não encontrada" }, 404);
  }

  const body = await request.json();

  // ============ CANCEL APPOINTMENT ============
  if (step === "cancel") {
    const { appointment_id, reason } = body;
    if (!appointment_id || !reason?.trim()) {
      return json({ error: "appointment_id e reason obrigatórios" }, 400);
    }

    const { error: updateError } = await supabase
      .from("appointments")
      .update({ status: "cancelado", cancel_reason: reason.trim(), cancelled_at: new Date().toISOString() })
      .eq("id", appointment_id)
      .eq("tenant_id", resolved.tenant_id);

    if (updateError) return json({ error: "Erro ao cancelar agendamento" }, 500);

    await supabase.from("appointment_history").insert({
      appointment_id,
      action: "canceled",
      reason: reason.trim(),
      performed_by: "cliente_booking_page",
    });

    return json({ success: true });
  }

  // ============ RESCHEDULE (mark old, redirect to new booking) ============
  if (step === "reschedule") {
    const { appointment_id, reason } = body;
    if (!appointment_id || !reason?.trim()) {
      return json({ error: "appointment_id e reason obrigatórios" }, 400);
    }

    const { error: updateError } = await supabase
      .from("appointments")
      .update({ status: "reagendado", cancel_reason: reason.trim(), cancelled_at: new Date().toISOString() })
      .eq("id", appointment_id)
      .eq("tenant_id", resolved.tenant_id);

    if (updateError) return json({ error: "Erro ao reagendar agendamento" }, 500);

    await supabase.from("appointment_history").insert({
      appointment_id,
      action: "rescheduled",
      reason: reason.trim(),
      performed_by: "cliente_booking_page",
    });

    return json({ success: true });
  }

  const {
    tenant_id,
    company_id,
    customer_name,
    customer_phone,
    professional_id,
    services,
    slot_start,
    slot_end,
  } = body;

  if (!customer_name || !customer_phone || !professional_id || !services?.length || !slot_start || !slot_end) {
    return json({ error: "Dados incompletos" }, 400);
  }

  // ---- Input validation ----
  const errors: string[] = [];

  if (typeof customer_name !== "string" || customer_name.trim().length < 2) {
    errors.push("Nome deve ter pelo menos 2 caracteres");
  }

  const phoneDigits = (customer_phone as string).replace(/\D/g, "");
  if (phoneDigits.length < 10) {
    errors.push("Telefone deve ter pelo menos 10 dígitos");
  }

  if (!UUID_RE.test(professional_id)) {
    errors.push("ID do profissional inválido");
  }

  if (!Array.isArray(services) || services.length === 0) {
    errors.push("Selecione pelo menos um serviço");
  } else {
    for (const s of services) {
      if (!s.id || !UUID_RE.test(s.id)) {
        errors.push("ID de serviço inválido");
        break;
      }
    }
  }

  const startDate = new Date(slot_start);
  if (isNaN(startDate.getTime())) {
    errors.push("Data/hora de início inválida");
  } else if (startDate.getTime() <= Date.now()) {
    errors.push("Data/hora de início deve ser no futuro");
  }

  if (errors.length > 0) {
    return json({ error: "Dados inválidos", details: errors }, 422);
  }

  // ---- Slot availability check ----
  const slotDate = slot_start.slice(0, 10); // YYYY-MM-DD
  const { data: availableSlots } = await supabase.rpc("get_available_slots", {
    p_tenant_id: resolved.tenant_id,
    p_professional_id: professional_id,
    p_service_id: services[0].id,
    p_date: slotDate,
  });

  const slotStillAvailable = (availableSlots || []).some(
    (s: { slot_start: string }) => s.slot_start === slot_start
  );

  if (!slotStillAvailable) {
    return json({ error: "Horário não está mais disponível" }, 409);
  }

  // 1. Upsert contact — normalize phone before lookup and storage
  const normalizedPhone = normalizePhone(customer_phone as string);
  const existingContact = await findContactByPhone(supabase, tenant_id, customer_phone as string);

  let contactId: string;

  if (existingContact) {
    // Update name and normalize stored phone if needed
    await supabase
      .from("contacts")
      .update({ name: customer_name, status: "agendado", phone: normalizedPhone })
      .eq("id", existingContact.id);
    contactId = existingContact.id;
  } else {
    const { data: newContact, error: contactError } = await supabase
      .from("contacts")
      .insert({
        tenant_id,
        name: customer_name,
        phone: normalizedPhone,   // always store normalized
        status: "agendado",
        source: "booking_page",
      })
      .select("id")
      .single();

    if (contactError) return json({ error: "Erro ao criar contato" }, 500);
    contactId = newContact.id;
  }

  // 2. Calculate total price
  const totalPrice = services.reduce(
    (sum: number, s: { id: string; price: number }) => sum + s.price,
    0
  );

  // 3. Create appointment
  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .insert({
      tenant_id,
      company_id: company_id || resolved.company_id,
      contact_id: contactId,
      professional_id,
      start_at: slot_start,
      end_at: slot_end,
      status: "pendente",
      total_price: totalPrice,
      created_via: "painel",
    })
    .select("id")
    .single();

  if (appointmentError) {
    return json({ error: "Erro ao criar agendamento" }, 500);
  }

  // 4. Create appointment_services
  const serviceRows = services.map((s: { id: string; price: number }) => ({
    appointment_id: appointment.id,
    service_id: s.id,
    price_at_time: s.price,
  }));

  const { error: servicesError } = await supabase
    .from("appointment_services")
    .insert(serviceRows);

  if (servicesError) {
    // Cleanup appointment on failure
    await supabase.from("appointments").delete().eq("id", appointment.id);
    return json({ error: "Erro ao vincular serviços" }, 500);
  }

  // 5. Update contact last_appointment_at
  await supabase
    .from("contacts")
    .update({ last_appointment_at: new Date().toISOString() })
    .eq("id", contactId);

  // 6. Log booking confirmation message
  const serviceNames = services.map((s: { id: string; name?: string }) => s.name || "Serviço").join(", ");
  const dateObj = new Date(slot_start);
  const BRT = "America/Sao_Paulo";
  const dateStr = dateObj.toLocaleDateString("pt-BR", { timeZone: BRT });
  const timeStr = dateObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: BRT });
  const confirmationMsg = `Agendamento confirmado: ${serviceNames} em ${dateStr} às ${timeStr}`;

  await supabase.from("messages").insert({
    tenant_id: resolved.tenant_id,
    contact_id: contactId,
    direction: "out",
    content: confirmationMsg,
    sent_by: "system",
    status: "pending",
  });

  return json({
    success: true,
    appointment_id: appointment.id,
    message: "Agendamento criado com sucesso!",
  });
}
