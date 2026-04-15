"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, LogOut, Calendar, Zap, DollarSign, Crown, Radio } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useTenantStore } from "@/stores/tenant-store";
import { cn } from "@/lib/utils";

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

    // WhatsApp session status
    const { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("status, service_active")
      .eq("tenant_id", tenantId)
      .single();

    const hasConnectedSession = session?.status === "connected";
    const serviceActive = hasConnectedSession ? (session?.service_active ?? false) : false;

    // Tokens (if IA plan)
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

    // Revenue this month
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01T00:00:00`;
    const { data: revenueData } = await supabase
      .from("appointments")
      .select("total_price")
      .eq("tenant_id", tenantId)
      .eq("status", "concluido")
      .gte("start_at", monthStart);
    const revenue = revenueData?.reduce((sum, a) => sum + (Number(a.total_price) || 0), 0) || 0;

    // Today's appointments
    const todayStr = now.toISOString().split("T")[0];
    const { data: todayAppts } = await supabase
      .from("appointments")
      .select("status")
      .eq("tenant_id", tenantId)
      .gte("start_at", `${todayStr}T00:00:00`)
      .lte("start_at", `${todayStr}T23:59:59`)
      .in("status", ["pendente", "confirmado", "concluido"]);

    const pendingToday = todayAppts?.filter((a) => a.status === "pendente" || a.status === "confirmado").length || 0;
    const completedToday = todayAppts?.filter((a) => a.status === "concluido").length || 0;

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
        setData((prev) => ({ ...prev, serviceActive: !prev.serviceActive }));
      }
    } catch {
      // silently ignore toggle error
    } finally {
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
              serviceDisabled
                ? "text-muted-foreground"
                : data.serviceActive
                ? "text-emerald-500"
                : "text-muted-foreground"
            )}
            strokeWidth={1.5}
          />
          {/* Toggle pill */}
          <span
            className={cn(
              "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
              serviceDisabled
                ? "bg-muted"
                : data.serviceActive
                ? "bg-emerald-500"
                : "bg-muted-foreground/30"
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

        {/* Revenue */}
        <div className="flex items-center gap-1.5 shrink-0">
          <DollarSign className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.5} />
          <span className="text-xs text-muted-foreground">{formatCurrency(data.revenue)}</span>
        </div>

        <div className="h-5 w-px bg-border shrink-0" />

        {/* Today appointments */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Calendar className="h-3.5 w-3.5 text-blue-500" strokeWidth={1.5} />
          <span className="text-xs text-muted-foreground">
            {data.pendingToday} pendente{data.pendingToday !== 1 ? "s" : ""} / {data.completedToday} concluído{data.completedToday !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Right: bell + user + logout */}
      <div className="flex items-center gap-4 shrink-0 ml-4">
        <button className="hover:text-amber-500 transition-colors relative text-muted-foreground">
          <Bell className="h-5 w-5" strokeWidth={1.5} />
          {data.pendingToday > 0 && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-error border-2 border-surface" />
          )}
        </button>

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
