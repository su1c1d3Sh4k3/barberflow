"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageSquare,
  Cake,
  Ticket,
  HandMetal,
  CreditCard,
  Plus,
  Copy,
  Trash2,
  Clock,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useTenantStore } from "@/stores/tenant-store";

type Tab = "followup" | "aniversario" | "cupons" | "boasvindas" | "pagamento";

interface FollowUp {
  id?: string;
  tenant_id: string;
  enabled: boolean;
  delay_hours: number;
  message: string;
  order_num: number;
}

interface Coupon {
  id: string;
  tenant_id: string;
  base_name: string;
  discount_pct: number;
  duration_days: number;
  created_at: string;
}

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "followup", label: "Follow-up", icon: <MessageSquare className="h-4 w-4" /> },
  { id: "aniversario", label: "Aniversário", icon: <Cake className="h-4 w-4" /> },
  { id: "cupons", label: "Cupons", icon: <Ticket className="h-4 w-4" /> },
  { id: "boasvindas", label: "Boas-vindas", icon: <HandMetal className="h-4 w-4" /> },
  { id: "pagamento", label: "Pagamento", icon: <CreditCard className="h-4 w-4" /> },
];

const variableChips = ["$nome", "$primeiro_nome", "$barbearia", "$cupom"];

function renderPreview(message: string) {
  return message
    .replace(/\$nome/g, "Joao")
    .replace(/\$primeiro_nome/g, "Joao")
    .replace(/\$barbearia/g, "Barbearia Teste")
    .replace(/\$cupom/g, "ANIVER_1234");
}

function WhatsAppBubble({ message, timestamp }: { message: string; timestamp: string }) {
  const rendered = renderPreview(message);
  if (!rendered.trim()) {
    return (
      <div className="text-xs text-muted-foreground italic">
        Digite uma mensagem acima para ver a pre-visualizacao
      </div>
    );
  }
  return (
    <div className="space-y-1" data-testid="whatsapp-preview">
      <span className="text-xs text-muted-foreground">Pre-visualizacao WhatsApp</span>
      <div className="relative max-w-sm">
        {/* Tail arrow */}
        <div
          className="absolute -left-2 top-0 h-0 w-0"
          style={{
            borderTop: "8px solid #DCF8C6",
            borderLeft: "8px solid transparent",
          }}
          data-testid="whatsapp-tail"
        />
        <div className="rounded-xl rounded-tl-sm bg-[#DCF8C6] px-4 py-2 shadow-sm">
          <p className="whitespace-pre-wrap text-sm text-foreground" data-testid="whatsapp-message-text">
            {rendered}
          </p>
          <span className="float-right mt-1 text-[10px] text-muted-foreground" data-testid="whatsapp-timestamp">
            {timestamp}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function DefinicoesPage() {
  const supabase = createClient();
  const { tenant } = useTenantStore();
  const tenantId = tenant?.id;

  const [activeTab, setActiveTab] = useState<Tab>("followup");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Follow-up state
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  // Aniversário state
  const [aniversarioEnabled, setAniversarioEnabled] = useState(false);
  const [aniversarioMessage, setAniversarioMessage] = useState("");
  const [aniversarioTime, setAniversarioTime] = useState("09:00");

  // Boas-vindas state
  const [boasVindasMessage, setBoasVindasMessage] = useState("");

  // Pagamento state
  const [pixKey, setPixKey] = useState("");
  const [paymentLink, setPaymentLink] = useState("");
  const [bookingLink, setBookingLink] = useState("");

  // Cupons state
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [showCouponForm, setShowCouponForm] = useState(false);
  const [newCoupon, setNewCoupon] = useState({ base_name: "", discount_pct: 10, duration_days: 30 });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Fetch all data on mount
  useEffect(() => {
    if (!tenantId) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function fetchAll() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [followupsRes, settingsRes, couponsRes] = await Promise.all([
        supabase.from("followups").select("*").eq("tenant_id", tenantId).order("order_num"),
        supabase.from("settings").select("*").eq("tenant_id", tenantId).single(),
        supabase.from("coupons").select("*").eq("tenant_id", tenantId),
      ]);

      // Follow-ups
      if (followupsRes.data && followupsRes.data.length > 0) {
        setFollowUps(followupsRes.data);
      } else {
        // Default empty follow-ups
        setFollowUps([
          { tenant_id: tenantId, enabled: false, delay_hours: 24, message: "", order_num: 1 },
          { tenant_id: tenantId, enabled: false, delay_hours: 168, message: "", order_num: 2 },
          { tenant_id: tenantId, enabled: false, delay_hours: 720, message: "", order_num: 3 },
        ]);
      }

      // Settings
      if (settingsRes.data) {
        const s = settingsRes.data;
        setAniversarioEnabled(s.birthday_enabled ?? false);
        setAniversarioMessage(s.birthday_message ?? "");
        setAniversarioTime(s.birthday_send_time ?? "09:00");
        setBoasVindasMessage(s.welcome_message ?? "");
        setPixKey(s.pix_key ?? "");
        setPaymentLink(s.payment_link ?? "");
        setBookingLink(s.booking_link ?? "");
      }

      // Coupons
      if (couponsRes.data) {
        setCoupons(couponsRes.data);
      }
    } catch (err) {
      console.error("Erro ao carregar definições:", err);
    } finally {
      setLoading(false);
    }
  }

  // Save follow-ups
  async function saveFollowUps() {
    if (!tenantId) return;
    setSaving(true);
    try {
      for (const fu of followUps) {
        const payload = {
          tenant_id: tenantId,
          enabled: fu.enabled,
          delay_hours: fu.delay_hours,
          message: fu.message,
          order_num: fu.order_num,
        };
        if (fu.id) {
          await supabase.from("followups").update(payload).eq("id", fu.id);
        } else {
          const { data } = await supabase.from("followups").insert(payload).select().single();
          if (data) {
            setFollowUps((prev) =>
              prev.map((f) => (f.order_num === fu.order_num && !f.id ? { ...f, id: data.id } : f))
            );
          }
        }
      }
      showToast("Follow-ups salvos com sucesso!");
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // Save settings (generic)
  async function saveSettings(fields: Record<string, unknown>) {
    if (!tenantId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("settings")
        .upsert({ tenant_id: tenantId, ...fields }, { onConflict: "tenant_id" });
      if (error) throw error;
      showToast("Configurações salvas com sucesso!");
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // Create coupon
  async function createCoupon() {
    if (!tenantId || !newCoupon.base_name) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("coupons")
        .insert({
          tenant_id: tenantId,
          base_name: newCoupon.base_name,
          discount_pct: newCoupon.discount_pct,
          duration_days: newCoupon.duration_days,
        })
        .select()
        .single();
      if (error) throw error;
      if (data) setCoupons((prev) => [...prev, data]);
      setNewCoupon({ base_name: "", discount_pct: 10, duration_days: 30 });
      setShowCouponForm(false);
      showToast("Cupom criado com sucesso!");
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // Delete coupon
  async function deleteCoupon(id: string) {
    if (!tenantId) return;
    const { error } = await supabase.from("coupons").delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) { console.error("Erro ao deletar cupom:", error); return; }
    setCoupons((prev) => prev.filter((c) => c.id !== id));
    showToast("Cupom removido.");
  }

  const insertVariable = (index: number, variable: string) => {
    const textarea = textareaRefs.current[index];
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const updated = [...followUps];
    const msg = updated[index].message;
    updated[index].message = msg.substring(0, start) + variable + msg.substring(end);
    setFollowUps(updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm text-white shadow-lg animate-in fade-in slide-in-from-top-2">
          <Check className="h-4 w-4" />
          {toast}
        </div>
      )}

      <h1 className="text-headline text-foreground">Definições</h1>

      <div className="flex gap-6">
        {/* Left vertical tabs */}
        <nav className="flex flex-col gap-1 min-w-[180px]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-left text-sm rounded-r-lg transition-all",
                activeTab === tab.id
                  ? "border-l-4 border-amber-500 font-bold text-foreground bg-amber-500/5"
                  : "border-l-4 border-transparent text-muted-foreground hover:bg-surface-container-lowest"
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 space-y-6">
          {/* Follow-up Tab */}
          {activeTab === "followup" && (
            <div className="space-y-4">
              {followUps.map((fu, idx) => (
                <div key={idx} className="rounded-card bg-surface-container-lowest p-6 shadow-card space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">Follow-up {idx + 1}</h3>
                    <button
                      onClick={() => {
                        const updated = [...followUps];
                        updated[idx].enabled = !updated[idx].enabled;
                        setFollowUps(updated);
                      }}
                      className="flex items-center gap-2"
                    >
                      {fu.enabled ? (
                        <ToggleRight className="h-8 w-8 text-amber-500" />
                      ) : (
                        <ToggleLeft className="h-8 w-8 text-muted-foreground" />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Enviar após</span>
                    <input
                      type="number"
                      value={fu.delay_hours}
                      onChange={(e) => {
                        const updated = [...followUps];
                        updated[idx].delay_hours = parseInt(e.target.value) || 0;
                        setFollowUps(updated);
                      }}
                      className="w-20 rounded-lg border border-border bg-surface-container-lowest px-3 py-1.5 text-sm"
                    />
                    <span className="text-sm text-muted-foreground">horas</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex gap-2">
                      {variableChips.map((v) => (
                        <button
                          key={v}
                          onClick={() => insertVariable(idx, v)}
                          className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200 transition"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <textarea
                      ref={(el) => { textareaRefs.current[idx] = el; }}
                      value={fu.message}
                      onChange={(e) => {
                        const updated = [...followUps];
                        updated[idx].message = e.target.value;
                        setFollowUps(updated);
                      }}
                      rows={3}
                      className="w-full rounded-lg border border-border bg-surface-container-lowest px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    />
                  </div>

                  {/* WhatsApp Preview */}
                  <WhatsAppBubble message={fu.message} timestamp="09:41" />
                </div>
              ))}

              <button
                onClick={saveFollowUps}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-amber-600 transition disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar Follow-ups
              </button>
            </div>
          )}

          {/* Aniversário Tab */}
          {activeTab === "aniversario" && (
            <div className="rounded-card bg-surface-container-lowest p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Mensagem de Aniversário</h3>
                <button onClick={() => setAniversarioEnabled(!aniversarioEnabled)}>
                  {aniversarioEnabled ? (
                    <ToggleRight className="h-8 w-8 text-amber-500" />
                  ) : (
                    <ToggleLeft className="h-8 w-8 text-muted-foreground" />
                  )}
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex gap-2">
                  {variableChips.map((v) => (
                    <button
                      key={v}
                      onClick={() => setAniversarioMessage((prev) => prev + v)}
                      className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200 transition"
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <textarea
                  value={aniversarioMessage}
                  onChange={(e) => setAniversarioMessage(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-border bg-surface-container-lowest px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>

              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Horário de envio</span>
                <input
                  type="time"
                  value={aniversarioTime}
                  onChange={(e) => setAniversarioTime(e.target.value)}
                  className="rounded-lg border border-border bg-surface-container-lowest px-3 py-1.5 text-sm"
                />
              </div>

              <WhatsAppBubble message={aniversarioMessage} timestamp={aniversarioTime} />

              <button
                onClick={() =>
                  saveSettings({
                    birthday_enabled: aniversarioEnabled,
                    birthday_message: aniversarioMessage,
                    birthday_send_time: aniversarioTime,
                  })
                }
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-amber-600 transition disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </button>
            </div>
          )}

          {/* Cupons Tab */}
          {activeTab === "cupons" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  onClick={() => setShowCouponForm(true)}
                  className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition"
                >
                  <Plus className="h-4 w-4" />
                  Criar cupom
                </button>
              </div>

              {showCouponForm && (
                <div className="rounded-card bg-surface-container-lowest p-6 shadow-card space-y-4">
                  <h4 className="font-semibold text-foreground">Novo Cupom</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Nome base</label>
                      <input
                        type="text"
                        value={newCoupon.base_name}
                        onChange={(e) => setNewCoupon({ ...newCoupon, base_name: e.target.value.toUpperCase() })}
                        placeholder="EX: BEMVINDO10"
                        className="w-full rounded-lg border border-border bg-surface-container-lowest px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Desconto (%)</label>
                      <input
                        type="number"
                        value={newCoupon.discount_pct}
                        onChange={(e) => setNewCoupon({ ...newCoupon, discount_pct: parseInt(e.target.value) || 0 })}
                        className="w-full rounded-lg border border-border bg-surface-container-lowest px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Validade (dias)</label>
                      <input
                        type="number"
                        value={newCoupon.duration_days}
                        onChange={(e) => setNewCoupon({ ...newCoupon, duration_days: parseInt(e.target.value) || 0 })}
                        className="w-full rounded-lg border border-border bg-surface-container-lowest px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={createCoupon}
                      disabled={saving}
                      className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition disabled:opacity-50"
                    >
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                      Criar
                    </button>
                    <button
                      onClick={() => setShowCouponForm(false)}
                      className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-card bg-surface-container-lowest shadow-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-container-lowest border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nome</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Desconto</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Validade (dias)</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Criado em</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                          Nenhum cupom cadastrado.
                        </td>
                      </tr>
                    )}
                    {coupons.map((coupon) => (
                      <tr key={coupon.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-mono font-medium text-foreground">{coupon.base_name}</td>
                        <td className="px-4 py-3 text-foreground">{coupon.discount_pct}%</td>
                        <td className="px-4 py-3 text-muted-foreground">{coupon.duration_days} dias</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(coupon.created_at).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => navigator.clipboard.writeText(coupon.base_name)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => deleteCoupon(coupon.id)}
                              className="text-muted-foreground hover:text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Boas-vindas Tab */}
          {activeTab === "boasvindas" && (
            <div className="rounded-card bg-surface-container-lowest p-6 shadow-card space-y-4">
              <h3 className="font-semibold text-foreground">Mensagem de Boas-vindas</h3>
              <div className="space-y-2">
                <div className="flex gap-2">
                  {variableChips.map((v) => (
                    <button
                      key={v}
                      onClick={() => setBoasVindasMessage((prev) => prev + v)}
                      className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200 transition"
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <textarea
                  value={boasVindasMessage}
                  onChange={(e) => setBoasVindasMessage(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-border bg-surface-container-lowest px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>
              <WhatsAppBubble message={boasVindasMessage} timestamp="09:41" />

              <button
                onClick={() => saveSettings({ welcome_message: boasVindasMessage })}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-amber-600 transition disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </button>
            </div>
          )}

          {/* Pagamento Tab */}
          {activeTab === "pagamento" && (
            <div className="rounded-card bg-surface-container-lowest p-6 shadow-card space-y-6">
              <h3 className="font-semibold text-foreground">Configurações de Pagamento</h3>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Chave Pix</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-surface-container-lowest px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(pixKey);
                      showToast("Chave Pix copiada!");
                    }}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition"
                  >
                    <Copy className="h-4 w-4" />
                    Copiar
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Link de pagamento</label>
                <input
                  type="text"
                  value={paymentLink}
                  onChange={(e) => setPaymentLink(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-container-lowest px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Link de agendamento online</label>
                <p className="text-xs text-muted-foreground">Enviado automaticamente na primeira mensagem do cliente via WhatsApp.</p>
                <input
                  type="text"
                  placeholder="https://seusite.com/b/sua-barbearia"
                  value={bookingLink}
                  onChange={(e) => setBookingLink(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-container-lowest px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>

              <button
                onClick={() => saveSettings({ pix_key: pixKey, payment_link: paymentLink, booking_link: bookingLink })}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-amber-600 transition disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
