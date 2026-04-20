"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Search,
  RefreshCw,
  Wifi,
  WifiOff,
  Crown,
  Edit2,
  ExternalLink,
  X,
  Zap,
  ChevronDown,
  ChevronUp,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
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
import { cn } from "@/lib/utils";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface TenantRow {
  id: string;
  name: string;
  public_slug: string | null;
  created_at: string;
  owner_name: string;
  owner_email: string;
  subscription_status: string;
  plan_id: string | null;
  plan_name: string;
  plan_tier: string;
  plan_has_ia: boolean;
  plan_price: number;
  trial_ends_at: string | null;
  current_period_end: string | null;
  whatsapp_status: string | null;
  whatsapp_phone: string | null;
  tokens_this_month: number;
}

interface TokenHistory {
  month: string;
  label: string;
  tokens: number;
  cost: number;
}

interface Plan {
  id: string;
  name: string;
  tier: string;
  has_ia: boolean;
  price_monthly: number;
}

const PLAN_COLORS: Record<string, string> = {
  trial: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  essencial: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  ia: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const SUB_STATUS_COLORS: Record<string, string> = {
  trial: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  past_due: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  canceled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  expired: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400",
  pending_payment: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
};

const SUB_STATUS_LABELS: Record<string, string> = {
  trial: "Trial",
  active: "Ativo",
  past_due: "Vencido",
  canceled: "Cancelado",
  expired: "Expirado",
  pending_payment: "Aguardando",
};

function WaStatus({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-pill bg-gray-100 dark:bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-500">
        <WifiOff className="h-3 w-3" /> Sem sessão
      </span>
    );
  }
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-pill bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <Wifi className="h-3 w-3" /> Conectado
      </span>
    );
  }
  if (status === "qr_pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-pill bg-amber-100 dark:bg-amber-900/30 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
        <AlertCircle className="h-3 w-3" /> QR Pendente
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-red-100 dark:bg-red-900/30 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-400">
      <WifiOff className="h-3 w-3" /> Desconectado
    </span>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [filtered, setFiltered] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [tokenHistory, setTokenHistory] = useState<Record<string, TokenHistory[]>>({});
  const [loadingHistory, setLoadingHistory] = useState<string | null>(null);
  const [editingTenant, setEditingTenant] = useState<TenantRow | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editForm, setEditForm] = useState({
    plan_id: "",
    subscription_status: "",
    expiry_date: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [deletingTenant, setDeletingTenant] = useState<TenantRow | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const editModalRef = useRef<HTMLDivElement>(null);
  const deleteModalRef = useRef<HTMLDivElement>(null);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tenants", { credentials: "include" });
      const data = await res.json();
      setTenants(data.data || []);
      setFiltered(data.data || []);
    } catch {
      setTenants([]);
      setFiltered([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPlans = useCallback(async () => {
    const res = await fetch("/api/plans", { credentials: "include" });
    const data = await res.json();
    setPlans(data.data || data || []);
  }, []);

  useEffect(() => {
    fetchTenants();
    fetchPlans();
  }, [fetchTenants, fetchPlans]);

  // Search filter
  useEffect(() => {
    const q = search.toLowerCase();
    if (!q) {
      setFiltered(tenants);
      return;
    }
    setFiltered(
      tenants.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.owner_email.toLowerCase().includes(q) ||
          t.owner_name.toLowerCase().includes(q) ||
          (t.whatsapp_phone || "").includes(q)
      )
    );
  }, [search, tenants]);

  // Close edit modal on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (editModalRef.current && !editModalRef.current.contains(e.target as Node)) {
        setEditingTenant(null);
      }
    }
    if (editingTenant) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [editingTenant]);

  // Close delete modal on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (deleteModalRef.current && !deleteModalRef.current.contains(e.target as Node)) {
        setDeletingTenant(null);
        setDeleteConfirmName("");
      }
    }
    if (deletingTenant) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [deletingTenant]);

  const handleExpandRow = async (tenantId: string) => {
    if (expandedRow === tenantId) {
      setExpandedRow(null);
      return;
    }
    setExpandedRow(tenantId);

    if (!tokenHistory[tenantId]) {
      setLoadingHistory(tenantId);
      try {
        const res = await fetch(`/api/admin/tenants/${tenantId}`, { credentials: "include" });
        const data = await res.json();
        setTokenHistory((prev) => ({ ...prev, [tenantId]: data.data || [] }));
      } catch {
        setTokenHistory((prev) => ({ ...prev, [tenantId]: [] }));
      } finally {
        setLoadingHistory(null);
      }
    }
  };

  const handleOpenEdit = (tenant: TenantRow) => {
    setEditingTenant(tenant);
    setSaveSuccess(false);
    const expiryDate = tenant.trial_ends_at || tenant.current_period_end || "";
    setEditForm({
      plan_id: tenant.plan_id || "",
      subscription_status: tenant.subscription_status,
      expiry_date: expiryDate ? expiryDate.slice(0, 10) : "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editingTenant) return;
    setSaving(true);

    const selectedPlan = plans.find((p) => p.id === editForm.plan_id);
    const isTrial = editForm.subscription_status === "trial";

    try {
      const res = await fetch(`/api/admin/tenants/${editingTenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          plan_id: editForm.plan_id || null,
          subscription_status: editForm.subscription_status,
          expiry_date: editForm.expiry_date ? new Date(editForm.expiry_date + "T23:59:59.000Z").toISOString() : null,
          is_trial: isTrial,
          plan_tier: selectedPlan?.tier || (isTrial ? "trial" : null),
        }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        await fetchTenants();
        setTimeout(() => {
          setEditingTenant(null);
          setSaveSuccess(false);
        }, 1200);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleImpersonate = async (tenant: TenantRow) => {
    setImpersonating(tenant.id);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenantId: tenant.id }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Erro ao acessar sistema do cliente");
        return;
      }

      const { tokenHash, otpType } = await res.json();

      // Sign in as tenant owner via magic link OTP
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType === "magiclink" ? "magiclink" : "email",
      });

      if (error) {
        alert("Erro ao autenticar como cliente: " + error.message);
        return;
      }

      // Navigate to the client's dashboard
      router.push("/dashboard");
    } catch {
      alert("Erro inesperado ao acessar o sistema do cliente.");
    } finally {
      setImpersonating(null);
    }
  };

  const handleDeleteTenant = async () => {
    if (!deletingTenant) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/tenants/${deletingTenant.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setDeletingTenant(null);
        setDeleteConfirmName("");
        await fetchTenants();
      } else {
        let msg = `Erro ${res.status}`;
        try {
          const err = await res.json();
          msg = err.error || msg;
        } catch { /* body não é JSON */ }
        alert(msg);
      }
    } catch (err) {
      alert("Erro de conexão: " + String(err));
    } finally {
      setDeleting(false);
    }
  };

  // Computed stats for topbar
  const activeClients = tenants.filter(
    (t) => t.subscription_status === "active" || t.subscription_status === "trial"
  ).length;
  const connectedWhatsApp = tenants.filter((t) => t.whatsapp_status === "connected").length;

  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("pt-BR");
  };

  const getDaysLeft = (date: string | null) => {
    if (!date) return null;
    const diff = new Date(date).getTime() - Date.now();
    return Math.ceil(diff / 86400000);
  };

  return (
    <>
      <AdminTopbar
        totalClients={tenants.length}
        activeClients={activeClients}
        connectedWhatsApp={connectedWhatsApp}
      />

      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-headline text-foreground">Clientes BarberFlow</h1>
            <p className="text-body text-muted-foreground">
              {tenants.length} tenants cadastrados
            </p>
          </div>
          <button
            onClick={fetchTenants}
            disabled={loading}
            className="flex items-center gap-2 rounded-btn bg-surface-container-lowest border border-border px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-surface-container shadow-soft"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} strokeWidth={1.5} />
            Atualizar
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, email, telefone..."
            className="h-11 w-full rounded-input bg-surface-container-lowest pl-10 pr-4 text-sm text-foreground shadow-soft placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          />
        </div>

        {/* Table */}
        <div className="rounded-card bg-surface-container-lowest shadow-card overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1fr_120px_140px_120px_130px_160px] gap-4 px-5 py-3 bg-surface-container border-b border-border">
            <p className="text-label uppercase text-muted-foreground">Cliente</p>
            <p className="text-label uppercase text-muted-foreground">Email</p>
            <p className="text-label uppercase text-muted-foreground">Plano</p>
            <p className="text-label uppercase text-muted-foreground">WhatsApp</p>
            <p className="text-label uppercase text-muted-foreground">Tokens/mês</p>
            <p className="text-label uppercase text-muted-foreground">Expira em</p>
            <p className="text-label uppercase text-muted-foreground">Ações</p>
          </div>

          {/* Rows */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
              <span className="ml-2 text-sm text-muted-foreground">Carregando clientes...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {search ? "Nenhum resultado para a busca" : "Nenhum cliente cadastrado"}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((tenant) => {
                const daysLeft = getDaysLeft(tenant.trial_ends_at || tenant.current_period_end);
                const isExpanded = expandedRow === tenant.id;
                const history = tokenHistory[tenant.id] || [];

                return (
                  <div key={tenant.id}>
                    {/* Main row */}
                    <div className="grid grid-cols-[1fr_1fr_120px_140px_120px_130px_160px] gap-4 items-center px-5 py-4 hover:bg-surface-container/50 transition-colors">
                      {/* Cliente */}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{tenant.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{tenant.owner_name}</p>
                      </div>

                      {/* Email */}
                      <p className="text-sm text-muted-foreground truncate">{tenant.owner_email}</p>

                      {/* Plano */}
                      <div className="flex flex-col gap-1">
                        <span className={cn("inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-semibold w-fit", PLAN_COLORS[tenant.plan_tier] || PLAN_COLORS.trial)}>
                          <Crown className="h-3 w-3" />
                          {tenant.plan_name}
                        </span>
                        <span className={cn("inline-flex rounded-pill px-2 py-0.5 text-[10px] font-medium w-fit", SUB_STATUS_COLORS[tenant.subscription_status] || SUB_STATUS_COLORS.trial)}>
                          {SUB_STATUS_LABELS[tenant.subscription_status] || tenant.subscription_status}
                        </span>
                      </div>

                      {/* WhatsApp */}
                      <WaStatus status={tenant.whatsapp_status} />

                      {/* Tokens */}
                      <div className="flex items-center gap-1.5">
                        {tenant.plan_has_ia ? (
                          <>
                            <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" strokeWidth={1.5} />
                            <span className="text-sm text-foreground font-medium">
                              {tenant.tokens_this_month.toLocaleString("pt-BR")}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </div>

                      {/* Expira em */}
                      <div>
                        {daysLeft !== null ? (
                          <div>
                            <p className={cn("text-sm font-medium", daysLeft <= 3 ? "text-error" : daysLeft <= 7 ? "text-amber-600" : "text-foreground")}>
                              {daysLeft <= 0 ? "Expirado" : `${daysLeft}d`}
                            </p>
                            <p className="text-xs text-muted-foreground">{formatDate(tenant.trial_ends_at || tenant.current_period_end)}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>

                      {/* Ações */}
                      <div className="flex items-center gap-2">
                        {/* Expand tokens chart */}
                        <button
                          onClick={() => handleExpandRow(tenant.id)}
                          title="Ver histórico de tokens"
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-lg border transition-all",
                            isExpanded
                              ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-600"
                              : "border-border bg-surface-container text-muted-foreground hover:border-amber-400 hover:text-amber-600"
                          )}
                        >
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>

                        {/* Edit plan */}
                        <button
                          onClick={() => handleOpenEdit(tenant)}
                          title="Editar plano"
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-container text-muted-foreground hover:border-blue-400 hover:text-blue-600 transition-all"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>

                        {/* Impersonate */}
                        <button
                          onClick={() => handleImpersonate(tenant)}
                          disabled={impersonating === tenant.id}
                          title="Acessar sistema do cliente"
                          className="flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-all disabled:opacity-60"
                        >
                          {impersonating === tenant.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ExternalLink className="h-3.5 w-3.5" />
                          )}
                          Acessar
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => { setDeletingTenant(tenant); setDeleteConfirmName(""); }}
                          title="Excluir conta"
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-container text-muted-foreground hover:border-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded row — token history chart */}
                    {isExpanded && (
                      <div className="px-5 py-5 bg-surface-container/30 border-t border-border/50">
                        <div className="flex items-center gap-2 mb-4">
                          <Zap className="h-4 w-4 text-amber-500" strokeWidth={1.5} />
                          <h4 className="text-sm font-semibold text-foreground">
                            Consumo de tokens — {tenant.name}
                          </h4>
                        </div>

                        {loadingHistory === tenant.id ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                          </div>
                        ) : !tenant.plan_has_ia ? (
                          <p className="py-6 text-center text-sm text-muted-foreground">
                            Este cliente não possui plano com IA ativada
                          </p>
                        ) : history.length === 0 ? (
                          <p className="py-6 text-center text-sm text-muted-foreground">
                            Nenhum consumo de tokens registrado
                          </p>
                        ) : (
                          <div className="h-40">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={history} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                                <Tooltip
                                  cursor={{ fill: "rgba(245,158,11,0.08)" }}
                                  contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: 12 }}
                                  formatter={(value) => [Number(value).toLocaleString("pt-BR"), "Tokens"]}
                                />
                                <Bar dataKey="tokens" radius={[6, 6, 0, 0]} maxBarSize={40}>
                                  {history.map((_, i) => (
                                    <Cell key={i} fill={i === history.length - 1 ? "#F59E0B" : "#fcd34d"} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div ref={deleteModalRef} className="w-full max-w-md rounded-card bg-surface-container-lowest shadow-float">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/30">
                  <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="text-title text-foreground">Excluir conta</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Esta ação é irreversível</p>
                </div>
              </div>
              <button
                onClick={() => { setDeletingTenant(null); setDeleteConfirmName(""); }}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-container text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                Todos os dados de{" "}
                <span className="font-semibold text-foreground">{deletingTenant.name}</span>{" "}
                serão excluídos permanentemente: agendamentos, clientes, profissionais, serviços, histórico de mensagens e usuários.
              </p>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Digite <span className="text-red-600 font-semibold">{deletingTenant.name}</span> para confirmar
                </label>
                <input
                  type="text"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={deletingTenant.name}
                  className="h-11 w-full rounded-input bg-surface-container px-4 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-red-500/40"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
              <button
                onClick={() => { setDeletingTenant(null); setDeleteConfirmName(""); }}
                className="rounded-btn border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-surface-container transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteTenant}
                disabled={deleteConfirmName !== deletingTenant.name || deleting}
                className="flex items-center gap-2 rounded-btn bg-red-600 px-5 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-float disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleting ? "Excluindo..." : "Excluir permanentemente"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Plan Modal */}
      {editingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div ref={editModalRef} className="w-full max-w-md rounded-card bg-surface-container-lowest shadow-float">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h3 className="text-title text-foreground">Editar plano</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{editingTenant.name}</p>
              </div>
              <button
                onClick={() => setEditingTenant(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-container text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-5">
              {/* Status */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Status da assinatura
                </label>
                <select
                  value={editForm.subscription_status}
                  onChange={(e) => setEditForm((f) => ({ ...f, subscription_status: e.target.value }))}
                  className="h-11 w-full rounded-input bg-surface-container px-4 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                >
                  <option value="trial">Trial</option>
                  <option value="active">Ativo</option>
                  <option value="past_due">Vencido</option>
                  <option value="canceled">Cancelado</option>
                  <option value="expired">Expirado</option>
                </select>
              </div>

              {/* Plan */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Plano
                </label>
                <select
                  value={editForm.plan_id}
                  onChange={(e) => setEditForm((f) => ({ ...f, plan_id: e.target.value }))}
                  className="h-11 w-full rounded-input bg-surface-container px-4 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                >
                  <option value="">— Sem plano (trial) —</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.tier.toUpperCase()} · R$ {p.price_monthly}/mês
                    </option>
                  ))}
                </select>
              </div>

              {/* Expiry date */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Data de expiração{" "}
                  <span className="text-muted-foreground font-normal">
                    ({editForm.subscription_status === "trial" ? "trial_ends_at" : "current_period_end"})
                  </span>
                </label>
                <input
                  type="date"
                  value={editForm.expiry_date}
                  onChange={(e) => setEditForm((f) => ({ ...f, expiry_date: e.target.value }))}
                  className="h-11 w-full rounded-input bg-surface-container px-4 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
                {editForm.expiry_date && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {getDaysLeft(new Date(editForm.expiry_date).toISOString()) ?? 0} dias a partir de hoje
                  </p>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
              <button
                onClick={() => setEditingTenant(null)}
                className="rounded-btn border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-surface-container transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="flex items-center gap-2 rounded-btn bg-amber-500 px-5 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-float disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saveSuccess ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? "Salvando..." : saveSuccess ? "Salvo!" : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
