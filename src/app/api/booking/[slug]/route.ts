import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

// UUID v4 regex
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // ============ CATEGORIES ============
  if (step === "categories") {
    const { data: categories, error } = await supabase
      .from("service_categories")
      .select("id, name, description, color")
      .eq("tenant_id", tenant_id)
      .order("name");

    if (error) return json({ error: error.message }, 500);
    return json({ categories });
  }

  // ============ SERVICES ============
  if (step === "services") {
    const categoryId = searchParams.get("category_id");
    if (!categoryId) return json({ error: "category_id obrigatório" }, 400);

    const { data: services, error } = await supabase
      .from("services")
      .select("id, name, description, duration_min, price, promo_active, promo_discount_pct")
      .eq("tenant_id", tenant_id)
      .eq("category_id", categoryId)
      .eq("active", true)
      .order("name");

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

    const proIds = links?.map((l) => l.professional_id) || [];

    if (proIds.length === 0) {
      // If no links, return all active professionals for the company
      const { data: professionals, error } = await supabase
        .from("professionals")
        .select("id, name, avatar_url, bio")
        .eq("tenant_id", tenant_id)
        .eq("active", true)
        .order("name");

      if (error) return json({ error: error.message }, 500);
      return json({ professionals });
    }

    const { data: professionals, error } = await supabase
      .from("professionals")
      .select("id, name, avatar_url, bio")
      .in("id", proIds)
      .eq("active", true)
      .order("name");

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

  if (step !== "book") {
    return json({ error: "step inválido" }, 400);
  }

  const resolved = await resolveTenant(supabase, slug);
  if (!resolved) {
    return json({ error: "Barbearia não encontrada" }, 404);
  }

  const body = await request.json();
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

  // 1. Upsert contact
  const { data: existingContact } = await supabase
    .from("contacts")
    .select("id")
    .eq("tenant_id", tenant_id)
    .eq("phone", customer_phone)
    .single();

  let contactId: string;

  if (existingContact) {
    // Update name if needed
    await supabase
      .from("contacts")
      .update({ name: customer_name, status: "agendado" })
      .eq("id", existingContact.id);
    contactId = existingContact.id;
  } else {
    const { data: newContact, error: contactError } = await supabase
      .from("contacts")
      .insert({
        tenant_id,
        name: customer_name,
        phone: customer_phone,
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
