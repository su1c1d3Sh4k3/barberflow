"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Bell, LogOut, Calendar, Zap, DollarSign, Crown, Radio,
  X, RefreshCw, CheckCircle, Clock, AlertTriangle, UserPlus, CalendarCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useTenantStore } from "@/stores/tenant-store";
import { cn } from "@/lib/utils";

// ─── Notification types ───────────────────────────────────────────────────────

type NotifType =
  | "new_appointment"
  | "canceled"
  | "rescheduled"
  | "confirmed"
  | "reminder_1h"
  | "reminder_10min"
  | "full_agenda"
  | "new_contact";

interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  detail?: string;
  at: Date;
}

const NOTIF_ICONS: Record<NotifType, React.ElementType> = {
  new_appointment: CalendarCheck,
  canceled: X,
  rescheduled: RefreshCw,
  confirmed: CheckCircle,
  reminder_1h: Clock,
  reminder_10min: Clock,
  full_agenda: AlertTriangle,
  new_contact: UserPlus,
};

const NOTIF_COLORS: Record<NotifType, string> = {
  new_appointment: "bg-emerald-100 text-emerald-600",
  canceled: "bg-red-100 text-red-600",
  rescheduled: "bg-purple-100 text-purple-600",
  confirmed: "bg-blue-100 text-blue-600",
  reminder_1h: "bg-amber-100 text-amber-600",
  reminder_10min: "bg-orange-100 text-orange-600",
  full_agenda: "bg-red-100 text-red-600",
  new_contact: "bg-sky-100 text-sky-600",
};

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return date.toLocaleDateString("pt-BR");
}

// ─── Topbar data ──────────────────────────────────────────────────────────────

interface TopbarData {
  planName: string;
  daysUntilRenewal: number | null;
  tokensUsed: number;
  hasIa: boolean;
  revenue: number;
  pendingToday: number;
  completedToday: number;
  serviceActive: boolean;
  hasConnectedSession: boolean;
}

export function Topbar() {
  const router = useRouter();
  const supabase = createClient();
  const { user, company, tenant } = useTenantStore();
  const tenantId = tenant?.id;

  const [data, setData] = useState<TopbarData>({
    planName: "—",
    daysUntilRenewal: null,
    tokensUsed: 0,
    hasIa: false,
    revenue: 0,
    pendingToday: 0,
    completedToday: 0,
    serviceActive: false,
    hasConnectedSession: false,
  });
  const [togglingService, setTogglingService] = useState(false);

  // ─── Notifications ──────────────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const notifiedAptIds = useRef<Set<string>>(new Set());

  const addNotif = useCallback((n: Omit<AppNotification, "id" | "at">) => {
    const notif: AppNotification = { ...n, id: crypto.randomUUID(), at: new Date() };
    setNotifications(prev => [notif, ...prev].slice(0, 50));
    setUnreadCount(prev => prev + 1);
  }, []);

  // Close notification dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Open dropdown → reset unread count
  const handleOpenNotif = () => {
    setNotifOpen(prev => !prev);
    if (!notifOpen) setUnreadCount(0);
  };

  // ─── Supabase Realtime for notifications ────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;

    const ch = supabase
      .channel(`topbar-notif-${tenantId}`)
      // Appointments INSERT
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "appointments", filter: `tenant_id=eq.${tenantId}` },
        async (payload) => {
          const row = payload.new as {
            id: string;
            contact_id: string;
            professional_id: string;
            start_at: string;
            tenant_id: string;
          };

          // Contact name for detail
          const { data: contact } = await supabase
            .from("contacts")
            .select("name")
            .eq("id", row.contact_id)
            .single();

          addNotif({
            type: "new_appointment",
            title: "Novo agendamento realizado",
            detail: contact?.name,
          });

          // Check agenda full (today only, after services are inserted)
          const aptDate = row.start_at.slice(0, 10);
          const todayDate = new Date().toISOString().slice(0, 10);
          if (aptDate === todayDate) {
            setTimeout(async () => {
              const { data: svcRows } = await supabase
                .from("appointment_services")
                .select("service_id")
                .eq("appointment_id", row.id)
                .limit(1);
              if (svcRows?.[0]) {
                const { data: slots } = await supabase.rpc("get_available_slots", {
                  p_tenant_id: tenantId,
                  p_professional_id: row.professional_id,
                  p_service_id: svcRows[0].service_id,
                  p_date: aptDate,
                });
                if (!slots || (slots as unknown[]).length === 0) {
                  addNotif({
                    type: "full_agenda",
                    title: "Agenda Lotada",
                    detail: new Date(aptDate + "T12:00:00").toLocaleDateString("pt-BR"),
                  });
                }
              }
            }, 1500);
          }

          // Refresh topbar data
          fetchData();
        }
      )
      // Appointments UPDATE (status changes)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "appointments", filter: `tenant_id=eq.${tenantId}` },
        async (payload) => {
          const row = payload.new as { status: string; contact_id: string };
          const old = payload.old as { status?: string };

          if (old.status && row.status === old.status) return;

          const { data: contact } = await supabase
            .from("contacts")
            .select("name")
            .eq("id", row.contact_id)
            .single();

          if (row.status === "cancelado") {
            addNotif({ type: "canceled", title: "Agendamento cancelado", detail: contact?.name });
          } else if (row.status === "reagendado") {
            addNotif({ type: "rescheduled", title: "Agendamento reagendado", detail: contact?.name });
          } else if (row.status === "confirmado") {
            addNotif({ type: "confirmed", title: "Agendamento confirmado", detail: contact?.name });
          }

          fetchData();
        }
      )
      // Contacts INSERT
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "contacts", filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const row = payload.new as { name: string };
          addNotif({ type: "new_contact", title: "Novo contato cadastrado", detail: row.name });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, addNotif]);

  // ─── Periodic reminder checks (every minute) ────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;

    const check = async () => {
      const now = Date.now();

      // 1h window: start_at in [now+55m, now+65m]
      const { data: apts1h } = await supabase
        .from("appointments")
        .select("id, start_at, contacts(name)")
        .eq("tenant_id", tenantId)
        .in("status", ["pendente", "confirmado"])
        .gte("start_at", new Date(now + 55 * 60_000).toISOString())
        .lte("start_at", new Date(now + 65 * 60_000).toISOString());

      for (const apt of (apts1h || []) as unknown as Array<{ id: string; contacts: { name: string } | null }>) {
        const key = `1h-${apt.id}`;
        if (!notifiedAptIds.current.has(key)) {
          notifiedAptIds.current.add(key);
          addNotif({
            type: "reminder_1h",
            title: "Agendamento em 1 hora",
            detail: apt.contacts?.name,
          });
        }
      }

      // 10min window: start_at in [now+5m, now+15m]
      const { data: apts10m } = await supabase
        .from("appointments")
        .select("id, start_at, contacts(name)")
        .eq("tenant_id", tenantId)
        .in("status", ["pendente", "confirmado"])
        .gte("start_at", new Date(now + 5 * 60_000).toISOString())
        .lte("start_at", new Date(now + 15 * 60_000).toISOString());

      for (const apt of (apts10m || []) as unknown as Array<{ id: string; contacts: { name: string } | null }>) {
        const key = `10m-${apt.id}`;
        if (!notifiedAptIds.current.has(key)) {
          notifiedAptIds.current.add(key);
          addNotif({
            type: "reminder_10min",
            title: "Agendamento em 10 minutos",
            detail: apt.contacts?.name,
          });
        }
      }
    };

    // Run immediately, then every 60s
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, addNotif]);

  // ─── Topbar data fetch ───────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!tenantId) return;

    // Subscription + plan
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("status, trial_ends_at, current_period_end, plan_id")
      .eq("tenant_id", tenantId)
      .single();

    let planName = "Gratuito";
    let daysUntilRenewal: number | null = null;
    let hasIa = false;

    if (sub) {
      if (sub.plan_id) {
        const { data: plan } = await supabase
          .from("plans")
          .select("name, has_ia")
          .eq("id", sub.plan_id)
          .single();
        if (plan) {
          planName = plan.name;
          hasIa = plan.has_ia ?? false;
        }
      }
      if (sub.status === "trial") {
        planName = "Trial (7 dias)";
        if (sub.trial_ends_at) {
          const diff = new Date(sub.trial_ends_at).getTime() - Date.now();
          daysUntilRenewal = Math.max(0, Math.ceil(diff / 86400000));
        }
      } else if (sub.current_period_end) {
        const diff = new Date(sub.current_period_end).getTime() - Date.now();
        daysUntilRenewal = Math.max(0, Math.ceil(diff / 86400000));
      }
    }

    // WhatsApp session
    const { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("status, service_active")
      .eq("tenant_id", tenantId)
      .single();

    const hasConnectedSession = session?.status === "connected";
    const serviceActive = hasConnectedSession ? (session?.service_active ?? false) : false;

    // Tokens
    let tokensUsed = 0;
    if (hasIa) {
      const now = new Date();
      const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const { data: usage } = await supabase
        .from("ia_usage")
        .select("tokens_input, tokens_output")
        .eq("tenant_id", tenantId)
        .gte("period_start", periodStart);
      if (usage) {
        tokensUsed = usage.reduce((sum, u) => sum + (u.tokens_input || 0) + (u.tokens_output || 0), 0);
      }
    }

    // Revenue this month (completed appointments)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { data: revenueData } = await supabase
      .from("appointments")
      .select("total_price")
      .eq("tenant_id", tenantId)
      .eq("status", "concluido")
      .gte("start_at", monthStart);
    const revenue = revenueData?.reduce((sum, a) => sum + (Number(a.total_price) || 0), 0) || 0;

    const { count: pendingCount } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["pendente", "confirmado"])
      .gte("start_at", monthStart);
    const pendingToday = pendingCount || 0;

    const { count: completedCount } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "concluido")
      .gte("start_at", monthStart);
    const completedToday = completedCount || 0;

    setData({ planName, daysUntilRenewal, tokensUsed, hasIa, revenue, pendingToday, completedToday, serviceActive, hasConnectedSession });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    useTenantStore.getState().reset();
    router.push("/login");
  };

  const handleToggleService = async () => {
    if (!data.hasConnectedSession || togglingService) return;
    setTogglingService(true);
    try {
      const res = await fetch("/api/whatsapp/service-active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_active: !data.serviceActive }),
      });
      if (res.ok) {
        setData(prev => ({ ...prev, serviceActive: !prev.serviceActive }));
      }
    } catch { /* silently ignore */ } finally {
      setTogglingService(false);
    }
  };

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const serviceDisabled = !data.hasConnectedSession || togglingService;
  const serviceTooltip = !data.hasConnectedSession
    ? "Conecte o WhatsApp primeiro"
    : data.serviceActive
    ? "Desativar atendimento automático"
    : "Ativar atendimento automático";

  return (
    <header className="fixed top-0 right-0 z-30 flex h-topbar items-center justify-between px-6 ml-sidebar bg-surface/80 backdrop-blur-xl border-b border-border/50">
      {/* Left: Plan + metrics */}
      <div className="flex items-center gap-5 overflow-x-auto">
        {/* Plan badge */}
        <div className="flex items-center gap-2 shrink-0">
          <Crown className="h-4 w-4 text-amber-500" strokeWidth={1.5} />
          <div className="leading-tight">
            <p className="text-xs font-bold text-foreground">{data.planName}</p>
            {data.daysUntilRenewal !== null && (
              <p className="text-[10px] text-muted-foreground">
                {data.daysUntilRenewal === 0 ? "Expira hoje" : `${data.daysUntilRenewal}d restantes`}
              </p>
            )}
          </div>
        </div>

        {/* Service active toggle */}
        <button
          onClick={handleToggleService}
          disabled={serviceDisabled}
          title={serviceTooltip}
          aria-label={serviceTooltip}
          className={cn(
            "flex items-center gap-2 shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all border",
            serviceDisabled
              ? "opacity-50 cursor-not-allowed border-border text-muted-foreground bg-transparent"
              : data.serviceActive
              ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100"
              : "bg-surface-container border-border text-muted-foreground hover:border-amber-400 hover:text-foreground"
          )}
        >
          <Radio
            className={cn(
              "h-3.5 w-3.5 transition-colors",
              serviceDisabled ? "text-muted-foreground" : data.serviceActive ? "text-emerald-500" : "text-muted-foreground"
            )}
            strokeWidth={1.5}
          />
          <span
            className={cn(
              "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
              serviceDisabled ? "bg-muted" : data.serviceActive ? "bg-emerald-500" : "bg-muted-foreground/30"
            )}
          >
            <span
              className={cn(
                "inline-block h-3 w-3 rounded-full bg-white shadow transition-transform",
                data.serviceActive ? "translate-x-3.5" : "translate-x-0.5"
              )}
            />
          </span>
          <span>Ativar atendimento</span>
        </button>

        <div className="h-5 w-px bg-border shrink-0" />

        {/* Tokens — only if IA plan */}
        {data.hasIa && (
          <>
            <div className="flex items-center gap-1.5 shrink-0">
              <Zap className="h-3.5 w-3.5 text-amber-500" strokeWidth={1.5} />
              <span className="text-xs text-muted-foreground">{data.tokensUsed.toLocaleString("pt-BR")} tokens</span>
            </div>
            <div className="h-5 w-px bg-border shrink-0" />
          </>
        )}

        {/* Revenue this month */}
        <div className="flex items-center gap-1.5 shrink-0">
          <DollarSign className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.5} />
          <span className="text-xs text-muted-foreground">{formatCurrency(data.revenue)}</span>
        </div>

        <div className="h-5 w-px bg-border shrink-0" />

        {/* Today: pending / completed */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Calendar className="h-3.5 w-3.5 text-blue-500" strokeWidth={1.5} />
          <span className="text-xs text-muted-foreground">
            {data.pendingToday} pendente{data.pendingToday !== 1 ? "s" : ""} · {data.completedToday} concluído{data.completedToday !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Right: notifications + user + logout */}
      <div className="flex items-center gap-4 shrink-0 ml-4">

        {/* Notification bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={handleOpenNotif}
            className="relative flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-container-high text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Notificações"
          >
            <Bell className="h-5 w-5" strokeWidth={1.5} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white border-2 border-surface">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* Notification dropdown */}
          {notifOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-card bg-surface-container-lowest shadow-card border border-border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Notificações</p>
                {notifications.length > 0 && (
                  <button
                    onClick={() => setNotifications([])}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Limpar
                  </button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-10 text-center">
                    <Bell className="mx-auto h-8 w-8 text-muted-foreground/40" strokeWidth={1} />
                    <p className="mt-2 text-sm text-muted-foreground">Nenhuma notificação</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {notifications.map((n) => {
                      const Icon = NOTIF_ICONS[n.type];
                      return (
                        <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-container-low">
                          <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", NOTIF_COLORS[n.type])}>
                            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{n.title}</p>
                            {n.detail && <p className="text-xs text-muted-foreground truncate">{n.detail}</p>}
                          </div>
                          <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(n.at)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-5 w-px bg-border" />

        <div className="text-right hidden lg:block">
          <p className="text-xs font-bold text-foreground">{user?.name?.split(" ")[0] || "Perfil"}</p>
          <p className="text-[10px] text-muted-foreground">{company?.name || ""}</p>
        </div>

        <button
          onClick={handleLogout}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-high text-muted-foreground hover:text-foreground transition-colors"
          title="Sair"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
