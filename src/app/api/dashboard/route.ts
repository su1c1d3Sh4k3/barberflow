import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, db } from "../_helpers";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { tenantId } = auth;
  const p = req.nextUrl.searchParams;
  const days = parseInt(p.get("days") || "30");

  const supabase = db();
  const now = new Date();
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - days);
  const fromStr = fromDate.toISOString();

  // KPIs
  const [contactsRes, appointmentsRes, revenueRes, followupRes] = await Promise.all([
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.from("appointments").select("id, status, start_at").eq("tenant_id", tenantId).gte("start_at", fromStr),
    supabase.from("appointments").select("total_price").eq("tenant_id", tenantId).in("status", ["confirmado", "concluido"]).gte("start_at", fromStr),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "follow_up"),
  ]);

  const totalContacts = contactsRes.count || 0;
  const appointments = appointmentsRes.data || [];
  const totalAppointments = appointments.length;
  const revenue = (revenueRes.data || []).reduce((sum: number, a: { total_price: number }) => sum + Number(a.total_price || 0), 0);
  const followupCount = followupRes.count || 0;

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  for (const a of appointments) {
    statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
  }

  // Appointments by day of week (0=Sunday, 6=Saturday)
  const byDayOfWeek = [0, 0, 0, 0, 0, 0, 0];
  for (const a of appointments) {
    const dow = new Date(a.start_at).getDay();
    byDayOfWeek[dow]++;
  }

  // Revenue by professional
  const { data: profAppointments } = await supabase
    .from("appointments")
    .select("total_price, professionals(name)")
    .eq("tenant_id", tenantId)
    .in("status", ["confirmado", "concluido"])
    .gte("start_at", fromStr);

  const profRevenueMap: Record<string, number> = {};
  for (const a of profAppointments || []) {
    const profName = (a.professionals as unknown as { name: string } | null)?.name || "Sem profissional";
    profRevenueMap[profName] = (profRevenueMap[profName] || 0) + Number(a.total_price || 0);
  }
  const revenueByProfessional = Object.entries(profRevenueMap)
    .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);

  // Appointments for export
  const { data: exportAppointments } = await supabase
    .from("appointments")
    .select("start_at, status, total_price, contacts(name), professionals(name), appointment_services(services(name))")
    .eq("tenant_id", tenantId)
    .gte("start_at", fromStr)
    .order("start_at", { ascending: true });

  // WhatsApp status
  const { data: whatsappSession } = await supabase
    .from("whatsapp_sessions")
    .select("status, phone_number")
    .eq("tenant_id", tenantId)
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();

  // Upcoming appointments (next 5)
  const { data: upcoming } = await supabase
    .from("appointments")
    .select("id, start_at, status, contacts(name, phone), professionals(name), appointment_services(services(name))")
    .eq("tenant_id", tenantId)
    .in("status", ["pendente", "confirmado"])
    .gte("start_at", now.toISOString())
    .order("start_at", { ascending: true })
    .limit(5);

  return ok({
    kpis: {
      total_contacts: totalContacts,
      total_appointments: totalAppointments,
      conversion_rate: totalContacts > 0 ? Math.round((totalAppointments / totalContacts) * 100) : 0,
      revenue: Math.round(revenue * 100) / 100,
      followup_count: followupCount,
    },
    status_breakdown: statusCounts,
    appointments_by_day_of_week: byDayOfWeek,
    revenue_by_professional: revenueByProfessional,
    appointments_for_export: (exportAppointments || []).map((a) => ({
      date: a.start_at,
      client: (a.contacts as unknown as { name: string } | null)?.name || "",
      service: (a.appointment_services as unknown as Array<{ services: { name: string } | null }>)
        ?.map((s) => s.services?.name)
        .filter(Boolean)
        .join(", ") || "",
      professional: (a.professionals as unknown as { name: string } | null)?.name || "",
      status: a.status,
      value: Number(a.total_price || 0),
    })),
    whatsapp: whatsappSession ? { connected: true, phone: whatsappSession.phone_number } : { connected: false },
    upcoming: upcoming || [],
  });
}
