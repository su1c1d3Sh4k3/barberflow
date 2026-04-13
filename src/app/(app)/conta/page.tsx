"use client";

import { useState, useEffect } from "react";
import { useTenantStore } from "@/stores/tenant-store";
import {
  User,
  CreditCard,
  FileText,
  Users,
  Loader2,
  AlertCircle,
  Clock,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "perfil" | "plano" | "faturamento" | "equipe";

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "perfil", label: "Perfil", icon: User },
  { id: "plano", label: "Plano", icon: CreditCard },
  { id: "faturamento", label: "Faturamento", icon: FileText },
  { id: "equipe", label: "Equipe", icon: Users },
];

interface SubscriptionData {
  status: string;
  plan_id: string;
  current_period_end: string | null;
  trial_ends_at: string | null;
  plans?: {
    name: string;
    tier: string;
    price_monthly: number;
  };
}

interface Invoice {
  id: string;
  description: string;
  value: number;
  status: string;
  due_date: string;
  billing_type: string;
  invoice_url?: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

export default function ContaPage() {
  const [activeTab, setActiveTab] = useState<Tab>("perfil");
  const [sub, setSub] = useState<SubscriptionData | null>(null);
  const [subLoading, setSubLoading] = useState(true);

  useEffect(() => {
    fetchSubscription();
  }, []);

  async function fetchSubscription() {
    try {
      const resp = await fetch("/api/subscriptions/current");
      if (resp.status === 404) {
        setSub(null);
        return;
      }
      const body = await resp.json();
      if (body.success) setSub(body.data);
    } catch {
      /* silent */
    } finally {
      setSubLoading(false);
    }
  }

  // Calculate trial days remaining
  const trialDaysLeft = (() => {
    if (!sub || sub.status !== "trial") return null;
    const endDate = sub.trial_ends_at || sub.current_period_end;
    if (!endDate) return null;
    const diff = new Date(endDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();

  return (
    <div className="space-y-6">
      <h1 className="text-headline text-foreground">Minha Conta</h1>

      {/* Trial Banner */}
      {!subLoading && sub?.status === "trial" && trialDaysLeft !== null && (
        <div className="rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 p-5 shadow-lg">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Clock className="h-6 w-6 text-white" />
              <div>
                <p className="font-bold text-white">
                  Seu trial termina em {trialDaysLeft} dia{trialDaysLeft !== 1 ? "s" : ""}
                </p>
                <p className="text-sm text-amber-50">
                  Assine agora para não perder acesso às funcionalidades
                </p>
              </div>
            </div>
            <a
              href="/conta/planos"
              className="rounded-lg bg-surface-container-lowest px-5 py-2 text-sm font-bold text-amber-600 hover:bg-amber-50 transition shadow"
            >
              Assinar agora
            </a>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 rounded-lg bg-surface-container p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition flex-1 justify-center",
              activeTab === tab.id
                ? "bg-surface-container-lowest text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "perfil" && <PerfilTab />}
      {activeTab === "plano" && <PlanoTab />}
      {activeTab === "faturamento" && <FaturamentoTab />}
      {activeTab === "equipe" && <EquipeTab />}
    </div>
  );
}

/* ─── Perfil Tab ─── */
function PerfilTab() {
  const user = useTenantStore((s) => s.user);
  const company = useTenantStore((s) => s.company);

  return (
    <div className="space-y-4">
      <div className="rounded-card bg-surface-container-lowest p-6 shadow-card space-y-4">
        <h2 className="font-semibold text-foreground">Dados do usuário</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Nome</p>
            <p className="font-medium text-foreground">{user?.name || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">E-mail</p>
            <p className="font-medium text-foreground">{user?.email || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Empresa</p>
            <p className="font-medium text-foreground">{company?.name || "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Plano Tab ─── */
function PlanoTab() {
  const tenant = useTenantStore((s) => s.tenant);
  const [sub, setSub] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [canceling, setCanceling] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);

  useEffect(() => {
    fetchSubscription();
  }, []);

  async function fetchSubscription() {
    try {
      const resp = await fetch("/api/subscriptions/current");
      if (resp.status === 404) {
        setSub(null);
        return;
      }
      const body = await resp.json();
      if (body.success) setSub(body.data);
      else setError(body.error);
    } catch {
      setError("Erro ao carregar assinatura");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelSubscription() {
    if (!tenant) return;
    setCanceling(true);
    setError(null);
    try {
      const resp = await fetch("/api/subscriptions/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": tenant.id,
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ reason: cancelReason || undefined }),
      });
      const body = await resp.json();
      if (body.success) {
        setCancelSuccess(true);
        setShowCancelModal(false);
        setCancelReason("");
        // Refresh subscription data
        fetchSubscription();
      } else {
        setError(body.error || "Erro ao cancelar assinatura");
        setShowCancelModal(false);
      }
    } catch {
      setError("Erro de rede ao cancelar assinatura");
      setShowCancelModal(false);
    } finally {
      setCanceling(false);
    }
  }

  const canCancel = sub && !["canceled", "expired"].includes(sub.status);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
      </div>
    );
  }

  if (!sub) {
    return (
      <div className="rounded-card bg-surface-container-lowest p-6 shadow-card text-center space-y-4">
        <p className="text-muted-foreground">Nenhuma assinatura ativa.</p>
        <a
          href="/conta/planos"
          className="inline-block rounded-lg bg-amber-500 px-6 py-2 text-sm font-bold text-white hover:bg-amber-600 transition"
        >
          Ver planos
        </a>
      </div>
    );
  }

  const statusLabels: Record<string, { label: string; color: string }> = {
    active: { label: "Ativo", color: "bg-green-100 text-green-800" },
    trial: { label: "Trial", color: "bg-blue-100 text-blue-800" },
    pending_payment: { label: "Aguardando pagamento", color: "bg-yellow-100 text-yellow-800" },
    past_due: { label: "Em atraso", color: "bg-red-100 text-red-800" },
    canceled: { label: "Cancelado", color: "bg-gray-100 text-gray-800" },
    expired: { label: "Expirado", color: "bg-gray-100 text-gray-800" },
  };

  const statusInfo = statusLabels[sub.status] || { label: sub.status, color: "bg-gray-100" };

  return (
    <div className="space-y-4">
      <div className="rounded-card bg-surface-container-lowest p-6 shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Assinatura atual</h2>
          <span className={cn("rounded-full px-3 py-1 text-xs font-medium", statusInfo.color)}>
            {statusInfo.label}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Plano</p>
            <p className="font-medium text-foreground">{sub.plans?.name || sub.plan_id}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Valor mensal</p>
            <p className="font-medium text-foreground">
              {sub.plans?.price_monthly
                ? `R$ ${Number(sub.plans.price_monthly).toFixed(2)}`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Próxima cobrança</p>
            <p className="font-medium text-foreground">
              {sub.current_period_end
                ? new Date(sub.current_period_end).toLocaleDateString("pt-BR")
                : "—"}
            </p>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <a
            href="/conta/planos"
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition"
          >
            Mudar de plano
          </a>
        </div>

        {/* Cancel Subscription Button */}
        {canCancel && (
          <div className="border-t border-border pt-4 mt-4">
            <button
              onClick={() => setShowCancelModal(true)}
              className="rounded-lg border-2 border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 hover:border-red-400 transition"
            >
              Cancelar assinatura
            </button>
          </div>
        )}
      </div>

      {/* Cancel Success Message */}
      {cancelSuccess && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 p-4 text-sm text-green-700">
          <AlertCircle className="h-4 w-4" />
          Assinatura cancelada com sucesso. Você manterá acesso até o final do período atual.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-surface-container-lowest p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-foreground">Cancelar assinatura</h3>
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 p-3">
              <p className="text-sm text-red-700">
                Tem certeza? Você perderá acesso ao final do período atual.
              </p>
            </div>

            <div>
              <label className="block text-sm text-muted-foreground mb-1">
                Motivo do cancelamento (opcional)
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Conte-nos por que está cancelando..."
                rows={3}
                className="w-full rounded-[12px] border border-border px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-amber-500/40 resize-none"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelReason("");
                }}
                disabled={canceling}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-container-low transition"
              >
                Voltar
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={canceling}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                {canceling && <Loader2 className="h-4 w-4 animate-spin" />}
                {canceling ? "Cancelando..." : "Confirmar cancelamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Faturamento Tab ─── */
function FaturamentoTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInvoices();
  }, []);

  async function fetchInvoices() {
    try {
      const resp = await fetch("/api/subscriptions/invoices");
      const body = await resp.json();
      if (body.success) setInvoices(body.data || []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }

  const statusLabels: Record<string, { label: string; color: string }> = {
    PENDING: { label: "Pendente", color: "text-yellow-600" },
    CONFIRMED: { label: "Confirmado", color: "text-green-600" },
    RECEIVED: { label: "Pago", color: "text-green-600" },
    OVERDUE: { label: "Vencido", color: "text-red-600" },
    REFUNDED: { label: "Estornado", color: "text-foreground/70" },
    DELETED: { label: "Cancelado", color: "text-foreground/70" },
    FAILED: { label: "Falhou", color: "text-red-600" },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="rounded-card bg-surface-container-lowest p-12 text-center shadow-card">
        <p className="text-muted-foreground">Nenhuma fatura encontrada.</p>
      </div>
    );
  }

  return (
    <div className="rounded-card bg-surface-container-lowest shadow-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-container-low border-b">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Descrição</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Valor</th>
            <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-center font-medium text-muted-foreground">Ação</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {invoices.map((inv) => {
            const info = statusLabels[inv.status] || { label: inv.status, color: "text-foreground/70" };
            return (
              <tr key={inv.id} className="hover:bg-surface-container-low/50">
                <td className="px-4 py-3 text-foreground">
                  {new Date(inv.due_date).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-4 py-3 text-foreground">{inv.description}</td>
                <td className="px-4 py-3 text-right font-medium text-foreground">
                  R$ {Number(inv.value).toFixed(2)}
                </td>
                <td className={cn("px-4 py-3 text-center font-medium", info.color)}>
                  {info.label}
                </td>
                <td className="px-4 py-3 text-center">
                  {inv.invoice_url ? (
                    <a
                      href={inv.invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-600 hover:underline text-xs"
                    >
                      Download
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Equipe Tab ─── */
function EquipeTab() {
  const tenant = useTenantStore((s) => s.tenant);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("professional");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  useEffect(() => {
    fetchMembers();
  }, [tenant]);

  async function fetchMembers() {
    if (!tenant) return;
    try {
      const resp = await fetch("/api/team", {
        headers: {
          "x-tenant-id": tenant.id,
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
      });
      const body = await resp.json();
      if (body.success) setMembers(body.data || []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant || !inviteEmail) return;
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(false);

    try {
      const resp = await fetch("/api/team", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": tenant.id,
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const body = await resp.json();
      if (body.success) {
        setInviteSuccess(true);
        setInviteEmail("");
        setShowInvite(false);
        fetchMembers();
      } else {
        setInviteError(body.error || "Erro ao convidar");
      }
    } catch {
      setInviteError("Erro de rede");
    } finally {
      setInviting(false);
    }
  }

  const roleBadge: Record<string, { label: string; color: string }> = {
    owner: { label: "Proprietário", color: "bg-amber-100 text-amber-800" },
    admin: { label: "Admin", color: "bg-purple-100 text-purple-800" },
    professional: { label: "Profissional", color: "bg-blue-100 text-blue-800" },
    receptionist: { label: "Recepcionista", color: "bg-green-100 text-green-800" },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground">Membros da equipe</h2>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition"
        >
          {showInvite ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showInvite ? "Cancelar" : "Convidar membro"}
        </button>
      </div>

      {/* Invite Form */}
      {showInvite && (
        <div className="rounded-card bg-surface-container-lowest p-6 shadow-card">
          <h3 className="font-semibold text-foreground mb-4">Convidar novo membro</h3>
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">E-mail</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@exemplo.com"
                required
                className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Função</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-amber-500/40"
              >
                <option value="admin">Admin</option>
                <option value="professional">Profissional</option>
                <option value="receptionist">Recepcionista</option>
              </select>
            </div>
            {inviteError && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {inviteError}
              </div>
            )}
            <button
              type="submit"
              disabled={inviting}
              className="rounded-lg bg-amber-500 px-6 py-2 text-sm font-bold text-white hover:bg-amber-600 transition disabled:opacity-50"
            >
              {inviting ? "Enviando..." : "Enviar convite"}
            </button>
          </form>
        </div>
      )}

      {inviteSuccess && (
        <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 px-4 py-3 text-sm text-green-700">
          Convite enviado com sucesso!
        </div>
      )}

      {/* Members List */}
      <div className="rounded-card bg-surface-container-lowest shadow-card overflow-hidden">
        {members.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Nenhum membro encontrado.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nome</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">E-mail</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Função</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Membro desde</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {members.map((member) => {
                const badge = roleBadge[member.role] || { label: member.role, color: "bg-surface-container text-foreground" };
                return (
                  <tr key={member.id} className="hover:bg-surface-container-low/50">
                    <td className="px-4 py-3 font-medium text-foreground">{member.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{member.email}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("rounded-full px-3 py-1 text-xs font-medium", badge.color)}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(member.created_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
