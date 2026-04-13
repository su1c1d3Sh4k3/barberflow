"use client";

import { useState, useEffect } from "react";
import {
  Clock,
  Check,
  Sparkles,
  CreditCard,
  QrCode,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle,
  Copy,
  Lock,
  Shield,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useTenantStore } from "@/stores/tenant-store";

type Cycle = "mensal" | "recorrencia" | "semestral" | "anual";
type PaymentMethod = "pix" | "boleto" | "cartao";

const cycles: { id: Cycle; label: string; badge?: string }[] = [
  { id: "mensal", label: "Mensal" },
  { id: "recorrencia", label: "Recorrência Mensal", badge: "\uD83D\uDD25" },
  { id: "semestral", label: "Semestral -20%" },
  { id: "anual", label: "Anual -33%" },
];

const cycleToPlanSuffix: Record<Cycle, string> = {
  mensal: "monthly",
  recorrencia: "recurrent",
  semestral: "semiannual",
  anual: "annual",
};

const paymentMethodToAsaas: Record<PaymentMethod, string> = {
  pix: "PIX",
  boleto: "BOLETO",
  cartao: "CREDIT_CARD",
};

const prices: Record<Cycle, { essencial: number; ia: number }> = {
  mensal: { essencial: 99.90, ia: 149.90 },
  recorrencia: { essencial: 79.90, ia: 119.90 },
  semestral: { essencial: 69.90, ia: 109.90 },
  anual: { essencial: 59.90, ia: 99.90 },
};

const essencialFeatures = [
  "Agendamento online ilimitado",
  "Gestão de clientes",
  "Relatórios básicos",
  "Follow-up automático (3 msgs)",
  "Mensagens de aniversário",
  "Cupons de desconto",
  "Link de agendamento personalizado",
  "Suporte por e-mail",
];

const iaFeatures = [
  "Tudo do plano Essencial",
  "IA para atendimento WhatsApp",
  "Respostas automáticas inteligentes",
  "Base de conhecimento personalizada",
  "Handoff inteligente",
  "Modo teste para validação",
  "Relatórios avançados com IA",
  "Suporte prioritário",
];

interface SubscriptionData {
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
}

interface PaymentResult {
  payment_id?: string;
  pix_qr_code?: string;
  pix_copy_paste?: string;
}

export default function PlanosPage() {
  const [cycle, setCycle] = useState<Cycle>("recorrencia");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [selectedPlan, setSelectedPlan] = useState<"essencial" | "ia">("ia");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [sub, setSub] = useState<SubscriptionData | null>(null);

  // Credit card form state
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardCpf, setCardCpf] = useState("");
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  const tenant = useTenantStore((s) => s.tenant);
  const user = useTenantStore((s) => s.user);

  const currentPrice = prices[cycle][selectedPlan];

  // Card flag detection
  function detectCardFlag(num: string): { name: string; color: string } | null {
    const clean = num.replace(/\s/g, "");
    if (!clean) return null;
    if (clean.startsWith("4")) return { name: "Visa", color: "text-blue-600" };
    if (clean.startsWith("5")) return { name: "Mastercard", color: "text-orange-600" };
    if (clean.startsWith("3")) return { name: "Amex", color: "text-indigo-600" };
    if (clean.startsWith("6")) return { name: "Discover", color: "text-amber-600" };
    return null;
  }

  // Input masks
  function maskCardNumber(value: string): string {
    const clean = value.replace(/\D/g, "").slice(0, 16);
    return clean.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  }

  function maskExpiry(value: string): string {
    const clean = value.replace(/\D/g, "").slice(0, 4);
    if (clean.length >= 3) return `${clean.slice(0, 2)}/${clean.slice(2)}`;
    return clean;
  }

  function maskCpf(value: string): string {
    const clean = value.replace(/\D/g, "").slice(0, 11);
    if (clean.length > 9) return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
    if (clean.length > 6) return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6)}`;
    if (clean.length > 3) return `${clean.slice(0, 3)}.${clean.slice(3)}`;
    return clean;
  }

  function maskCvv(value: string): string {
    return value.replace(/\D/g, "").slice(0, 4);
  }

  // Validate credit card fields
  function validateCard(): boolean {
    const errors: Record<string, string> = {};
    const cleanNumber = cardNumber.replace(/\s/g, "");
    if (cleanNumber.length < 13 || cleanNumber.length > 16) {
      errors.number = "Número do cartão inválido";
    }
    if (!cardName.trim() || cardName.trim().split(" ").length < 2) {
      errors.name = "Informe o nome completo";
    }
    const [mm, yy] = cardExpiry.split("/");
    if (!mm || !yy || parseInt(mm) < 1 || parseInt(mm) > 12 || yy.length !== 2) {
      errors.expiry = "Validade inválida (MM/AA)";
    }
    if (cardCvv.length < 3) {
      errors.cvv = "CVV inválido";
    }
    const cleanCpf = cardCpf.replace(/\D/g, "");
    if (cleanCpf.length !== 11) {
      errors.cpf = "CPF inválido";
    }
    setCardErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const cardFlag = detectCardFlag(cardNumber);

  useEffect(() => {
    fetchSubscription();
  }, []);

  async function fetchSubscription() {
    try {
      const resp = await fetch("/api/subscriptions/current");
      if (resp.status === 404) return;
      const body = await resp.json();
      if (body.success) setSub(body.data);
    } catch {
      /* silent */
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

  async function handleConfirm() {
    if (!tenant || !user) {
      setError("Sessão não encontrada. Recarregue a página.");
      return;
    }
    if (!termsAccepted) {
      setError("Aceite os termos para continuar.");
      return;
    }

    // Validate credit card if selected
    if (paymentMethod === "cartao" && !validateCard()) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setPaymentResult(null);

    const planId = `${selectedPlan}_${cycleToPlanSuffix[cycle]}`;

    // Build credit card payload
    const [expiryMonth, expiryYear] = cardExpiry.split("/");
    const creditCardPayload = paymentMethod === "cartao" ? {
      credit_card: {
        holder_name: cardName.trim(),
        number: cardNumber.replace(/\s/g, ""),
        expiry_month: expiryMonth,
        expiry_year: `20${expiryYear}`,
        ccv: cardCvv,
      },
      credit_card_holder_info: {
        name: cardName.trim(),
        email: user.email,
        cpf: cardCpf.replace(/\D/g, ""),
      },
    } : {};

    try {
      const resp = await fetch("/api/subscriptions/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": tenant.id,
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          plan_id: planId,
          payment_method: paymentMethodToAsaas[paymentMethod],
          customer_name: user.name || tenant.name,
          customer_email: user.email,
          ...creditCardPayload,
        }),
      });

      const body = await resp.json();
      if (body.success) {
        setPaymentResult(body.data);
      } else {
        setError(body.error || "Erro ao criar assinatura");
      }
    } catch {
      setError("Erro de rede ao processar pagamento");
    } finally {
      setSubmitting(false);
    }
  }

  function copyPixCode() {
    if (paymentResult?.pix_copy_paste) {
      navigator.clipboard.writeText(paymentResult.pix_copy_paste);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // If payment was already generated, show the result
  if (paymentResult) {
    return (
      <div className="space-y-6">
        <h1 className="text-headline text-foreground">Pagamento</h1>

        <div className="max-w-lg mx-auto rounded-card bg-surface-container-lowest p-8 shadow-card text-center space-y-6">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
          <h2 className="text-lg font-bold text-foreground">Assinatura criada!</h2>

          {paymentMethod === "pix" && paymentResult.pix_qr_code && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Escaneie o QR Code abaixo para pagar via Pix:</p>
              <div className="flex justify-center">
                <img
                  src={`data:image/png;base64,${paymentResult.pix_qr_code}`}
                  alt="QR Code Pix"
                  className="h-48 w-48 rounded-lg"
                />
              </div>
              {paymentResult.pix_copy_paste && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Ou copie o código Pix:</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={paymentResult.pix_copy_paste}
                      className="flex-1 rounded-lg border border-border px-3 py-2 text-xs text-foreground bg-surface-container-low truncate"
                    />
                    <button
                      onClick={copyPixCode}
                      className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-medium text-white hover:bg-amber-600 transition"
                    >
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied ? "Copiado!" : "Copiar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {paymentMethod === "boleto" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                O boleto foi gerado. Ele pode levar até 3 dias úteis para compensar.
              </p>
              <p className="text-sm text-foreground font-medium">
                ID do pagamento: {paymentResult.payment_id}
              </p>
            </div>
          )}

          {paymentMethod === "cartao" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Seu pagamento está sendo processado.
              </p>
              <p className="text-sm text-foreground font-medium">
                ID do pagamento: {paymentResult.payment_id}
              </p>
            </div>
          )}

          <a
            href="/conta"
            className="inline-block rounded-lg bg-amber-500 px-6 py-2 text-sm font-bold text-white hover:bg-amber-600 transition"
          >
            Voltar para Minha Conta
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-headline text-foreground">Planos e Assinatura</h1>

      {/* Trial Banner */}
      {sub?.status === "trial" && trialDaysLeft !== null && (
        <div className="rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="h-6 w-6 text-white" />
              <div>
                <p className="font-bold text-white">
                  Seu trial termina em {trialDaysLeft} dia{trialDaysLeft !== 1 ? "s" : ""}
                </p>
                <p className="text-sm text-amber-50">Assine agora para não perder acesso às funcionalidades</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Billing Cycle Toggle */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-full bg-surface-container p-1">
          {cycles.map((c) => (
            <button
              key={c.id}
              onClick={() => setCycle(c.id)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition whitespace-nowrap",
                cycle === c.id
                  ? "bg-amber-500 text-white shadow"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {c.label} {c.badge && c.badge}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Plans Column */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Essencial Plan */}
          <div
            onClick={() => setSelectedPlan("essencial")}
            className={cn(
              "rounded-xl border-2 bg-surface-container-lowest p-6 shadow-card cursor-pointer transition",
              selectedPlan === "essencial" ? "border-amber-500" : "border-border hover:border-amber-300"
            )}
          >
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">Essencial</h3>
                <p className="text-sm text-muted-foreground">Para barbearias que querem organização</p>
              </div>
              <div>
                <span className="text-3xl font-bold text-foreground">{formatCurrency(prices[cycle].essencial)}</span>
                <span className="text-sm text-muted-foreground">/mês</span>
              </div>
              <ul className="space-y-2">
                {essencialFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* IA Plan */}
          <div
            onClick={() => setSelectedPlan("ia")}
            className={cn(
              "relative rounded-xl bg-surface-container-lowest p-6 shadow-card cursor-pointer transition",
              selectedPlan === "ia"
                ? "border-2 border-amber-500 bg-gradient-to-b from-amber-50/50 to-transparent"
                : "border-2 border-amber-300 hover:border-amber-500"
            )}
          >
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-3 py-0.5 text-xs font-bold text-white">
              Mais popular
            </span>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  IA
                </h3>
                <p className="text-sm text-muted-foreground">Atendimento inteligente 24h</p>
              </div>
              <div>
                <span className="text-3xl font-bold text-foreground">{formatCurrency(prices[cycle].ia)}</span>
                <span className="text-sm text-muted-foreground">/mês</span>
                <p className="text-xs text-amber-600 mt-1">+ consumo de tokens</p>
              </div>
              <ul className="space-y-2">
                {iaFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Right Column: Payment + Summary */}
        <div className="space-y-4">
          {/* Payment Method */}
          <div className="rounded-card bg-surface-container-lowest p-6 shadow-card space-y-4">
            <h3 className="font-semibold text-foreground">Método de pagamento</h3>
            <div className="space-y-2">
              <label
                onClick={() => setPaymentMethod("pix")}
                className={cn(
                  "flex items-center gap-3 rounded-lg border-2 p-3 cursor-pointer transition",
                  paymentMethod === "pix" ? "border-amber-500 bg-amber-50/50" : "border-border hover:border-amber-300"
                )}
              >
                <QrCode className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Pix</p>
                  <p className="text-xs text-muted-foreground">Aprovação instantânea</p>
                </div>
                <div className={cn("h-4 w-4 rounded-full border-2", paymentMethod === "pix" ? "border-amber-500 bg-amber-500" : "border-border")} />
              </label>

              <label
                onClick={() => setPaymentMethod("boleto")}
                className={cn(
                  "flex items-center gap-3 rounded-lg border-2 p-3 cursor-pointer transition",
                  paymentMethod === "boleto" ? "border-amber-500 bg-amber-50/50" : "border-border hover:border-amber-300"
                )}
              >
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Boleto</p>
                  <p className="text-xs text-muted-foreground">Até 3 dias úteis</p>
                </div>
                <div className={cn("h-4 w-4 rounded-full border-2", paymentMethod === "boleto" ? "border-amber-500 bg-amber-500" : "border-border")} />
              </label>

              <label
                onClick={() => setPaymentMethod("cartao")}
                className={cn(
                  "flex items-center gap-3 rounded-lg border-2 p-3 cursor-pointer transition",
                  paymentMethod === "cartao" ? "border-amber-500 bg-amber-50/50" : "border-border hover:border-amber-300"
                )}
              >
                <CreditCard className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Cartão de crédito</p>
                  <p className="text-xs text-muted-foreground">Aprovação instantânea</p>
                </div>
                <div className={cn("h-4 w-4 rounded-full border-2", paymentMethod === "cartao" ? "border-amber-500 bg-amber-500" : "border-border")} />
              </label>
            </div>
          </div>

          {/* Credit Card Form */}
          {paymentMethod === "cartao" && (
            <div className="rounded-card bg-surface-container-lowest p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Dados do cartão</h3>
                {cardFlag && (
                  <span className={cn("text-sm font-bold", cardFlag.color)}>
                    {cardFlag.name}
                  </span>
                )}
              </div>

              {/* Card Number */}
              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  Número do cartão
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0000 0000 0000 0000"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(maskCardNumber(e.target.value))}
                    className={cn(
                      "w-full rounded-[12px] border px-3 py-2.5 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-amber-500/40 pr-10",
                      cardErrors.number ? "border-red-400" : "border-border"
                    )}
                  />
                  <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
                {cardErrors.number && (
                  <p className="text-xs text-red-500 mt-1">{cardErrors.number}</p>
                )}
              </div>

              {/* Card Holder Name */}
              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  Nome no cartão
                </label>
                <input
                  type="text"
                  placeholder="NOME COMO NO CARTÃO"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value.toUpperCase())}
                  className={cn(
                    "w-full rounded-[12px] border px-3 py-2.5 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-amber-500/40",
                    cardErrors.name ? "border-red-400" : "border-border"
                  )}
                />
                {cardErrors.name && (
                  <p className="text-xs text-red-500 mt-1">{cardErrors.name}</p>
                )}
              </div>

              {/* Expiry + CVV row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">
                    Validade
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="MM/AA"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(maskExpiry(e.target.value))}
                    className={cn(
                      "w-full rounded-[12px] border px-3 py-2.5 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-amber-500/40",
                      cardErrors.expiry ? "border-red-400" : "border-border"
                    )}
                  />
                  {cardErrors.expiry && (
                    <p className="text-xs text-red-500 mt-1">{cardErrors.expiry}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">
                    CVV
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="000"
                    value={cardCvv}
                    onChange={(e) => setCardCvv(maskCvv(e.target.value))}
                    className={cn(
                      "w-full rounded-[12px] border px-3 py-2.5 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-amber-500/40",
                      cardErrors.cvv ? "border-red-400" : "border-border"
                    )}
                  />
                  {cardErrors.cvv && (
                    <p className="text-xs text-red-500 mt-1">{cardErrors.cvv}</p>
                  )}
                </div>
              </div>

              {/* CPF */}
              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  CPF do titular
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={cardCpf}
                  onChange={(e) => setCardCpf(maskCpf(e.target.value))}
                  className={cn(
                    "w-full rounded-[12px] border px-3 py-2.5 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-amber-500/40",
                    cardErrors.cpf ? "border-red-400" : "border-border"
                  )}
                />
                {cardErrors.cpf && (
                  <p className="text-xs text-red-500 mt-1">{cardErrors.cpf}</p>
                )}
              </div>

              {/* Secure badge */}
              <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 px-3 py-2">
                <Lock className="h-4 w-4 text-green-600 shrink-0" />
                <p className="text-xs text-green-700">
                  Pagamento seguro processado pelo Asaas
                </p>
                <Shield className="h-4 w-4 text-green-600 shrink-0 ml-auto" />
              </div>
            </div>
          )}

          {/* Order Summary */}
          <div className="rounded-card bg-surface-container-lowest p-6 shadow-card space-y-4">
            <h3 className="font-semibold text-foreground">Resumo do pedido</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plano</span>
                <span className="font-medium text-foreground">{selectedPlan === "ia" ? "IA" : "Essencial"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ciclo</span>
                <span className="font-medium text-foreground">{cycles.find((c) => c.id === cycle)?.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pagamento</span>
                <span className="font-medium text-foreground capitalize">{paymentMethod === "cartao" ? "Cartão" : paymentMethod}</span>
              </div>
              <hr className="border-border" />
              <div className="flex justify-between text-base">
                <span className="font-semibold text-foreground">Total</span>
                <span className="font-bold text-amber-600">{formatCurrency(currentPrice)}</span>
              </div>
              {selectedPlan === "ia" && (
                <p className="text-xs text-muted-foreground">+ consumo de tokens sob demanda</p>
              )}
            </div>

            {/* Terms checkbox */}
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border text-amber-500 focus:ring-amber-500"
              />
              <span className="text-xs text-muted-foreground">
                Li e aceito os termos de uso e a política de privacidade do BarberFlow.
              </span>
            </label>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <button
              onClick={handleConfirm}
              disabled={submitting || !termsAccepted}
              className="w-full rounded-lg bg-amber-500 py-3 text-sm font-bold text-white hover:bg-amber-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Processando..." : "Confirmar assinatura"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
