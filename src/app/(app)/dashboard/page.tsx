"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Users,
  Calendar,
  TrendingUp,
  DollarSign,
  Download,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { cn, formatCurrency } from "@/lib/utils";
import { useTenantStore } from "@/stores/tenant-store";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/hooks/use-realtime";

interface Stats {
  contacts: number;
  appointments: number;
  confirmed: number;
  completed: number;
  canceled: number;
  rescheduled: number;
  followup: number;
  previsao: number;
  faturamento: number;
  conversionRate: number;
}

interface DayOfWeekData {
  day: string;
  count: number;
}

interface ProfessionalRevenue {
  name: string;
  previsao: number;
  faturamento: number;
  commission_pct: number;
  comissao: number;
}

interface ExportAppointment {
  date: string;
  client: string;
  service: string;
  professional: string;
  status: string;
  value: number;
}

interface AppointmentItem {
  id: string;
  start_at: string;
  status: string;
  contacts: { name: string } | null;
  professionals: { name: string } | null;
  appointment_services: Array<{ services: { name: string } | null }>;
}

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  reagendado: "Reagendado",
};

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-700",
  confirmado: "bg-emerald-100 text-emerald-700",
  concluido: "bg-blue-100 text-blue-700",
  cancelado: "bg-red-100 text-red-700",
  reagendado: "bg-purple-100 text-purple-700",
};

export default function DashboardPage() {
  const { user, tenant } = useTenantStore();
  const supabase = createClient();
  const [stats, setStats] = useState<Stats>({
    contacts: 0, appointments: 0, confirmed: 0, completed: 0,
    canceled: 0, rescheduled: 0, followup: 0, previsao: 0, faturamento: 0, conversionRate: 0,
  });
  const [lastAppointments, setLastAppointments] = useState<AppointmentItem[]>([]);
  const [dayOfWeekData, setDayOfWeekData] = useState<DayOfWeekData[]>(
    DAY_LABELS.map((day) => ({ day, count: 0 }))
  );
  const [profRevenue, setProfRevenue] = useState<ProfessionalRevenue[]>([]);
  const [exportData, setExportData] = useState<ExportAppointment[]>([]);
  const [period, setPeriod] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close export dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const fetchData = useCallback(async () => {
    if (!tenant?.id) return;

    const now = new Date();
    const days = [0, 7, 30, 30][period];
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - days);

    // Stats
    const { data: appointments } = await supabase
      .from("appointments")
      .select("id, status, total_price, start_at")
      .eq("tenant_id", tenant.id)
      .gte("start_at", dateFrom.toISOString())
      .lte("start_at", now.toISOString());

    const { count: contactsCount } = await supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id);

    const { count: followupCount } = await supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("status", "follow_up");

    // Also fetch upcoming active appointments (future pendente/confirmado) for previsão
    const { data: upcomingActive } = await supabase
      .from("appointments")
      .select("id, status, total_price, start_at")
      .eq("tenant_id", tenant.id)
      .in("status", ["pendente", "confirmado"])
      .gt("start_at", now.toISOString());

    const apt = appointments || [];
    const allActive = [...apt.filter(a => ["pendente", "confirmado"].includes(a.status)), ...(upcomingActive || [])];
    const previsao = allActive.reduce((sum, a) => sum + Number(a.total_price || 0), 0);
    const faturamento = apt
      .filter(a => a.status === "concluido")
      .reduce((sum, a) => sum + Number(a.total_price || 0), 0);

    setStats({
      contacts: contactsCount || 0,
      appointments: apt.length + (upcomingActive?.length || 0),
      confirmed: allActive.filter(a => a.status === "confirmado").length,
      completed: apt.filter(a => a.status === "concluido").length,
      canceled: apt.filter(a => a.status === "cancelado").length,
      rescheduled: apt.filter(a => a.status === "reagendado").length,
      followup: followupCount || 0,
      previsao: Math.round(previsao * 100) / 100,
      faturamento: Math.round(faturamento * 100) / 100,
      conversionRate: contactsCount ? Math.round(((apt.length + (upcomingActive?.length || 0)) / contactsCount) * 100) : 0,
    });

    // Appointments by day of week (real data)
    const byDow = [0, 0, 0, 0, 0, 0, 0];
    for (const a of apt) {
      const dow = new Date(a.start_at).getDay();
      byDow[dow]++;
    }
    setDayOfWeekData(DAY_LABELS.map((day, i) => ({ day, count: byDow[i] })));

    // Revenue by professional (previsao + faturamento + comissao)
    // No upper date limit: future pendente/confirmado are included in previsão
    const { data: profAppts } = await supabase
      .from("appointments")
      .select("total_price, status, start_at, professionals(id, name, commission_pct)")
      .eq("tenant_id", tenant.id)
      .in("status", ["pendente", "confirmado", "concluido"])
      .gte("start_at", dateFrom.toISOString());

    const profMap: Record<string, { previsao: number; faturamento: number; commission_pct: number }> = {};
    for (const a of profAppts || []) {
      const prof = a.professionals as unknown as { name: string; commission_pct: number } | null;
      const profName = prof?.name || "Sem profissional";
      const commPct = prof?.commission_pct || 0;
      if (!profMap[profName]) profMap[profName] = { previsao: 0, faturamento: 0, commission_pct: commPct };
      const price = Number(a.total_price || 0);
      const isFuture = new Date((a as { start_at: string }).start_at) > now;
      if (a.status === "concluido") {
        profMap[profName].faturamento += price;
      } else if (isFuture) {
        // Only future pendente/confirmado count as previsão (past-due overdue excluded)
        profMap[profName].previsao += price;
      }
    }
    setProfRevenue(
      Object.entries(profMap)
        .map(([name, d]) => ({
          name,
          previsao: Math.round(d.previsao * 100) / 100,
          faturamento: Math.round(d.faturamento * 100) / 100,
          commission_pct: d.commission_pct,
          comissao: Math.round(d.faturamento * d.commission_pct / 100 * 100) / 100,
        }))
        .sort((a, b) => (b.faturamento + b.previsao) - (a.faturamento + a.previsao))
    );

    // Export data
    const { data: exportAppts } = await supabase
      .from("appointments")
      .select("start_at, status, total_price, contacts(name), professionals(name), appointment_services(services(name))")
      .eq("tenant_id", tenant.id)
      .gte("start_at", dateFrom.toISOString())
      .lte("start_at", now.toISOString())
      .order("start_at", { ascending: true });

    setExportData(
      (exportAppts || []).map((a) => ({
        date: a.start_at,
        client: (a.contacts as unknown as { name: string } | null)?.name || "",
        service: (a.appointment_services as unknown as Array<{ services: { name: string } | null }>)
          ?.map((s) => s.services?.name)
          .filter(Boolean)
          .join(", ") || "",
        professional: (a.professionals as unknown as { name: string } | null)?.name || "",
        status: a.status,
        value: Number(a.total_price || 0),
      }))
    );

    // Last appointments (most recent in period)
    const { data: lastData } = await supabase
      .from("appointments")
      .select("id, start_at, status, contacts(name), professionals(name), appointment_services(services(name))")
      .eq("tenant_id", tenant.id)
      .gte("start_at", dateFrom.toISOString())
      .lte("start_at", now.toISOString())
      .order("start_at", { ascending: false })
      .limit(6);

    setLastAppointments((lastData as unknown as AppointmentItem[]) || []);
  }, [tenant?.id, period, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime updates
  useRealtime({
    table: "appointments",
    filter: tenant?.id ? `tenant_id=eq.${tenant.id}` : undefined,
    onInsert: () => fetchData(),
    onUpdate: () => fetchData(),
    enabled: !!tenant?.id,
  });

  const firstName = user?.name?.split(" ")[0] || "Usuario";
  const periodLabel = ["Hoje", "7 dias", "30 dias", "Personalizado"][period];

  const kpis = [
    { label: "Contatos totais", value: stats.contacts.toString(), icon: Users, color: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" },
    { label: "Agendamentos", value: stats.appointments.toString(), icon: Calendar, color: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" },
    { label: "Taxa de conversao", value: `${stats.conversionRate}%`, icon: TrendingUp, color: "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400" },
    { label: "Previsão", value: formatCurrency(stats.previsao), icon: DollarSign, color: "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400" },
    { label: "Faturamento", value: formatCurrency(stats.faturamento), icon: CheckCircle2, color: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" },
  ];

  const statusCards = [
    { label: "Confirmados", count: stats.confirmed, color: "bg-success" },
    { label: "Concluidos", count: stats.completed, color: "bg-info" },
    { label: "Cancelados", count: stats.canceled, color: "bg-error" },
    { label: "Reagendados", count: stats.rescheduled, color: "bg-warning" },
    { label: "Follow-up", count: stats.followup, color: "bg-purple-500" },
  ];

  const periods = ["Hoje", "7 dias", "30 dias", "Personalizado"];

  // --- Export handlers ---
  const handleExportCSV = useCallback(() => {
    const now = new Date();
    const days = [0, 7, 30, 30][period];
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - days);

    const lines: string[] = [];
    lines.push(`Relatorio BarberFlow - ${periodLabel}`);
    lines.push(`Periodo: ${dateFrom.toLocaleDateString("pt-BR")} a ${now.toLocaleDateString("pt-BR")}`);
    lines.push("");
    lines.push("--- KPIs ---");
    lines.push(`Contatos totais;${stats.contacts}`);
    lines.push(`Agendamentos;${stats.appointments}`);
    lines.push(`Taxa de conversao;${stats.conversionRate}%`);
    lines.push(`Previsao;${stats.previsao.toFixed(2)}`);
    lines.push(`Faturamento;${stats.faturamento.toFixed(2)}`);
    lines.push(`Confirmados;${stats.confirmed}`);
    lines.push(`Concluidos;${stats.completed}`);
    lines.push(`Cancelados;${stats.canceled}`);
    lines.push(`Reagendados;${stats.rescheduled}`);
    lines.push("");
    lines.push("--- Agendamentos ---");
    lines.push("Data;Cliente;Servico;Profissional;Status;Valor");

    for (const a of exportData) {
      const dateStr = new Date(a.date).toLocaleString("pt-BR");
      lines.push(`${dateStr};${a.client};${a.service};${a.professional};${a.status};${a.value.toFixed(2)}`);
    }

    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dashboard_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }, [period, periodLabel, stats, exportData]);

  const handleExportPDF = useCallback(() => {
    const now = new Date();
    const days = [0, 7, 30, 30][period];
    const dateFrom = new Date(now);
    dateFrom.setDate(dateFrom.getDate() - days);

    const html = `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"/>
      <title>Dashboard BarberFlow</title>
      <style>
        body { font-family: Inter, Arial, sans-serif; padding: 40px; color: #0F172A; }
        h1 { color: #F59E0B; margin-bottom: 4px; }
        h2 { color: #0F172A; border-bottom: 2px solid #F59E0B; padding-bottom: 4px; margin-top: 24px; }
        .period { color: #666; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
        th { background: #F59E0B; color: #fff; padding: 8px 12px; text-align: left; }
        td { border-bottom: 1px solid #e5e7eb; padding: 6px 12px; }
        .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-top: 12px; }
        .kpi-card { background: #fef3c7; border-radius: 12px; padding: 16px; text-align: center; }
        .kpi-value { font-size: 20px; font-weight: 700; }
        .kpi-label { font-size: 11px; color: #666; text-transform: uppercase; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      <h1>BarberFlow - Relatorio</h1>
      <p class="period">${periodLabel}: ${dateFrom.toLocaleDateString("pt-BR")} a ${now.toLocaleDateString("pt-BR")}</p>
      <h2>KPIs</h2>
      <div class="kpi-grid">
        <div class="kpi-card"><div class="kpi-value">${stats.contacts}</div><div class="kpi-label">Contatos</div></div>
        <div class="kpi-card"><div class="kpi-value">${stats.appointments}</div><div class="kpi-label">Agendamentos</div></div>
        <div class="kpi-card"><div class="kpi-value">${stats.conversionRate}%</div><div class="kpi-label">Conversao</div></div>
        <div class="kpi-card"><div class="kpi-value">R$ ${stats.previsao.toFixed(2)}</div><div class="kpi-label">Previsao</div></div>
        <div class="kpi-card"><div class="kpi-value">R$ ${stats.faturamento.toFixed(2)}</div><div class="kpi-label">Faturamento</div></div>
      </div>
      ${profRevenue.length > 0 ? `
      <h2>Faturamento por Profissional</h2>
      <table><tr><th>Profissional</th><th>Previsao</th><th>Faturamento</th><th>Comissao (${profRevenue[0]?.commission_pct || 0}%)</th></tr>
      ${profRevenue.map(p => `<tr><td>${p.name}</td><td>R$ ${p.previsao.toFixed(2)}</td><td>R$ ${p.faturamento.toFixed(2)}</td><td>R$ ${p.comissao.toFixed(2)}</td></tr>`).join("")}
      </table>` : ""}
      <h2>Agendamentos</h2>
      <table>
        <tr><th>Data</th><th>Cliente</th><th>Servico</th><th>Profissional</th><th>Status</th><th>Valor</th></tr>
        ${exportData.map(a => `<tr>
          <td>${new Date(a.date).toLocaleString("pt-BR")}</td>
          <td>${a.client}</td><td>${a.service}</td><td>${a.professional}</td>
          <td>${a.status}</td><td>R$ ${a.value.toFixed(2)}</td>
        </tr>`).join("")}
      </table>
      </body></html>
    `;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
    setExportOpen(false);
  }, [period, periodLabel, stats, profRevenue, exportData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-headline text-foreground">Ola, {firstName}</h1>
          <p className="text-body text-muted-foreground">
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Export dropdown */}
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setExportOpen(!exportOpen)}
              className="flex items-center gap-2 rounded-btn bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground shadow-soft transition-colors hover:bg-secondary/80"
            >
              <Download className="h-4 w-4" />
              Exportar
              <ChevronDown className={cn("h-4 w-4 transition-transform", exportOpen && "rotate-180")} />
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-card bg-surface-container-lowest p-1 shadow-card">
                <button
                  onClick={handleExportCSV}
                  className="flex w-full items-center gap-2 rounded-btn px-3 py-2 text-sm text-foreground hover:bg-surface-container-low"
                >
                  Exportar CSV
                </button>
                <button
                  onClick={handleExportPDF}
                  className="flex w-full items-center gap-2 rounded-btn px-3 py-2 text-sm text-foreground hover:bg-surface-container-low"
                >
                  Exportar PDF
                </button>
              </div>
            )}
          </div>
          {/* Period selector */}
          <div className="flex items-center gap-1 rounded-pill bg-surface-container-low p-1">
            {periods.map((p, i) => (
              <button
                key={p}
                onClick={() => setPeriod(i)}
                className={cn(
                  "rounded-pill px-4 py-2 text-sm font-medium transition-colors",
                  i === period
                    ? "bg-surface-container-lowest text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards — 5 cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="rounded-card bg-surface-container-lowest p-6 shadow-card">
              <div className="flex items-center gap-4">
                <div className={cn("flex h-12 w-12 items-center justify-center rounded-btn", kpi.color)}>
                  <Icon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-label uppercase text-muted-foreground">{kpi.label}</p>
                  <p className="text-headline text-foreground">{kpi.value}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Status pills */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statusCards.map((status) => (
          <div key={status.label} className="flex items-center gap-3 rounded-card bg-surface-container-lowest p-4 shadow-card">
            <div className={cn("h-2.5 w-2.5 rounded-full", status.color)} />
            <div>
              <p className="text-sm font-medium text-foreground">{status.count}</p>
              <p className="text-xs text-muted-foreground">{status.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Bar chart */}
        <div className="col-span-3 rounded-card bg-surface-container-lowest p-6 shadow-card">
          <h3 className="mb-4 text-title text-foreground">Agendamentos por dia da semana</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayOfWeekData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#94a3b8" }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#94a3b8" }} />
                <Tooltip
                  cursor={{ fill: "rgba(245,158,11,0.08)" }}
                  contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                  formatter={(value) => [String(value), "Agendamentos"]}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={40}>
                  {dayOfWeekData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={index === new Date().getDay() ? "#F59E0B" : "#fcd34d"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Ultimos agendamentos (replaces WhatsApp status) */}
        <div className="col-span-2 rounded-card bg-surface-container-lowest p-6 shadow-card">
          <h3 className="mb-4 text-title text-foreground">Últimos agendamentos</h3>
          {lastAppointments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum agendamento no período</p>
          ) : (
            <div className="space-y-2">
              {lastAppointments.map((apt) => {
                const svcName = apt.appointment_services?.[0]?.services?.name || "Serviço";
                const timeStr = new Date(apt.start_at).toLocaleString("pt-BR", {
                  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                });
                return (
                  <div key={apt.id} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface-container-low">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{apt.contacts?.name || "Cliente"}</p>
                      <p className="truncate text-xs text-muted-foreground">{svcName} · {apt.professionals?.name || ""}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">{timeStr}</p>
                      <span className={cn("mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_COLORS[apt.status] || "bg-gray-100 text-gray-600")}>
                        {STATUS_LABELS[apt.status] || apt.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Faturamento por profissional + Proximos agendamentos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Faturamento por profissional */}
        <div className="rounded-card bg-surface-container-lowest p-6 shadow-card">
          <h3 className="mb-4 text-title text-foreground">Faturamento por profissional</h3>
          {profRevenue.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum dado no periodo selecionado</p>
          ) : (
            <div className="space-y-4">
              {profRevenue.map((prof) => (
                <div key={prof.name} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">{prof.name}</span>
                    <span className="text-xs text-muted-foreground">comissão {prof.commission_pct}%</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-purple-50 px-2 py-1.5">
                      <p className="text-[10px] font-semibold uppercase text-purple-500">Previsão</p>
                      <p className="text-xs font-bold text-purple-700">{formatCurrency(prof.previsao)}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-2 py-1.5">
                      <p className="text-[10px] font-semibold uppercase text-emerald-500">Faturamento</p>
                      <p className="text-xs font-bold text-emerald-700">{formatCurrency(prof.faturamento)}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 px-2 py-1.5">
                      <p className="text-[10px] font-semibold uppercase text-amber-500">Comissão</p>
                      <p className="text-xs font-bold text-amber-700">{formatCurrency(prof.comissao)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming appointments */}
        <div className="rounded-card bg-surface-container-lowest p-6 shadow-card">
          <h3 className="mb-4 text-title text-foreground">Proximos agendamentos</h3>
          {lastAppointments.filter(a => ["pendente", "confirmado"].includes(a.status)).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum agendamento proximo</p>
          ) : (
            <div className="space-y-3">
              {lastAppointments
                .filter(a => ["pendente", "confirmado"].includes(a.status))
                .slice(0, 5)
                .map((apt) => (
                  <div key={apt.id} className="flex items-center gap-3 rounded-btn p-3 hover:bg-surface-container-low">
                    <div className="h-9 w-9 rounded-full bg-surface-container-high" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{apt.contacts?.name || "Cliente"}</p>
                      <p className="text-xs text-muted-foreground">
                        {apt.appointment_services?.map(s => s.services?.name).join(", ") || "Servico"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">
                        {new Date(apt.start_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <p className="text-xs text-muted-foreground">{apt.professionals?.name || ""}</p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
