"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getAppointments(tenantId: string, date: string, professionalId?: string) {
  const supabase = createServerSupabaseClient();
  let query = supabase
    .from("appointments")
    .select(`
      *,
      contacts(id, name, phone, avatar_url, tags, ltv),
      professionals(id, name, avatar_url),
      appointment_services(services(id, name, duration_min, price))
    `)
    .eq("tenant_id", tenantId)
    .gte("start_at", `${date}T00:00:00`)
    .lt("start_at", `${date}T23:59:59`)
    .not("status", "eq", "cancelado");

  if (professionalId) {
    query = query.eq("professional_id", professionalId);
  }

  const { data, error } = await query.order("start_at");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createAppointment(appointment: {
  tenant_id: string;
  company_id: string;
  contact_id: string;
  professional_id: string;
  start_at: string;
  end_at: string;
  total_price: number;
  notes?: string;
  created_via: "whatsapp" | "painel" | "ia";
  service_ids: string[];
  service_prices: Record<string, number>;
}) {
  const supabase = createServerSupabaseClient();
  const { service_ids, service_prices, ...aptData } = appointment;

  // Check for conflicts
  const { data: conflicts } = await supabase
    .from("appointments")
    .select("id")
    .eq("professional_id", appointment.professional_id)
    .in("status", ["pendente", "confirmado"])
    .lt("start_at", appointment.end_at)
    .gt("end_at", appointment.start_at);

  if (conflicts && conflicts.length > 0) {
    throw new Error("SLOT_UNAVAILABLE");
  }

  const { data: result, error } = await supabase
    .from("appointments")
    .insert(aptData)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Link services
  const aptServices = service_ids.map(sid => ({
    appointment_id: result.id,
    service_id: sid,
    price_at_time: service_prices[sid] || 0,
  }));

  await supabase.from("appointment_services").insert(aptServices);

  // Log history
  await supabase.from("appointment_history").insert({
    appointment_id: result.id,
    action: "created",
    new_state: result,
    performed_by: "admin",
  });

  // Update contact status
  await supabase
    .from("contacts")
    .update({
      status: "agendado",
      last_appointment_at: appointment.start_at,
    })
    .eq("id", appointment.contact_id);

  revalidatePath("/agenda");
  return result;
}

export async function updateAppointmentStatus(
  id: string,
  status: string,
  reason?: string
) {
  const supabase = createServerSupabaseClient();

  const { data: current } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", id);

  if (error) throw new Error(error.message);

  // Log history
  await supabase.from("appointment_history").insert({
    appointment_id: id,
    action: status === "cancelado" ? "canceled" : status === "confirmado" ? "confirmed" : status === "concluido" ? "completed" : "updated",
    previous_state: current,
    new_state: { ...current, status },
    reason,
    performed_by: "admin",
  });

  revalidatePath("/agenda");
}

export async function rescheduleAppointment(id: string, newStartAt: string, newEndAt: string) {
  const supabase = createServerSupabaseClient();

  const { data: current } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", id)
    .single();

  // Check conflicts for new slot
  if (current) {
    const { data: conflicts } = await supabase
      .from("appointments")
      .select("id")
      .eq("professional_id", current.professional_id)
      .neq("id", id)
      .in("status", ["pendente", "confirmado"])
      .lt("start_at", newEndAt)
      .gt("end_at", newStartAt);

    if (conflicts && conflicts.length > 0) {
      throw new Error("SLOT_UNAVAILABLE");
    }
  }

  const { error } = await supabase
    .from("appointments")
    .update({ start_at: newStartAt, end_at: newEndAt })
    .eq("id", id);

  if (error) throw new Error(error.message);

  await supabase.from("appointment_history").insert({
    appointment_id: id,
    action: "rescheduled",
    previous_state: current,
    new_state: { ...current, start_at: newStartAt, end_at: newEndAt },
    performed_by: "admin",
  });

  revalidatePath("/agenda");
}

export async function getDashboardStats(tenantId: string, dateFrom: string, dateTo: string) {
  const supabase = createServerSupabaseClient();

  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, status, total_price, professional_id, start_at")
    .eq("tenant_id", tenantId)
    .gte("start_at", dateFrom)
    .lte("start_at", dateTo);

  const { count: contactsCount } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  const apt = appointments || [];
  const total = apt.length;
  const confirmed = apt.filter(a => a.status === "confirmado").length;
  const completed = apt.filter(a => a.status === "concluido").length;
  const canceled = apt.filter(a => a.status === "cancelado").length;
  const revenue = apt
    .filter(a => ["confirmado", "concluido"].includes(a.status))
    .reduce((sum, a) => sum + (a.total_price || 0), 0);

  return {
    contacts: contactsCount || 0,
    appointments: total,
    confirmed,
    completed,
    canceled,
    revenue,
    conversionRate: contactsCount ? Math.round((total / contactsCount) * 100) : 0,
  };
}
