"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, LogOut, Calendar, Zap, DollarSign, Crown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useTenantStore } from "@/stores/tenant-store";

interface TopbarData {
  planName: string;
  daysUntilRenewal: number | null;
  tokensUsed: number;
  hasIa: boolean;
  revenue: number;
  pendingToday: number;
  completedToday: number;
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
  });

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
      // Get plan name
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

    setData({ planName, daysUntilRenewal, tokensUsed, hasIa, revenue, pendingToday, completedToday });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    useTenantStore.getState().reset();
    router.push("/login");
  };

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
