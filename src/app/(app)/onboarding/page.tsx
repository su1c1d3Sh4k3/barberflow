"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  User,
  Scissors,
  MessageCircle,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { maskPhone, maskCep, fetchCep, ESTADOS_BR } from "@/lib/masks";
import { useTenantStore } from "@/stores/tenant-store";
import { createClient } from "@/lib/supabase/client";

/* ─── Types ─── */
interface Step1Data {
  nomeEmpresa: string;
  telefone: string;
  descricao: string;
  cep: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
}

interface Step2Data {
  nome: string;
  telefone: string;
  bio: string;
  comissao: number;
}

interface ServiceItem {
  nome: string;
  duracao: string;
  preco: string;
}

interface Step3Data {
  categoriaNome: string;
  servicos: ServiceItem[];
}

/* ─── Steps config ─── */
const STEPS = [
  { label: "Empresa", icon: Building2 },
  { label: "Profissional", icon: User },
  { label: "Serviços", icon: Scissors },
  { label: "WhatsApp", icon: MessageCircle },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { tenant, company, user, setUser } = useTenantStore();

  /**
   * Resolve tenant_id and company_id without depending on the store.
   * Reads straight from the Supabase auth JWT (no RLS-gated DB query).
   */
  async function resolveIds(): Promise<{ tenantId: string; companyId: string | null }> {
    const supabase = createClient();

    // 1. tenant_id — from store or JWT
    let tenantId = tenant?.id;
    if (!tenantId) {
      const { data: { session } } = await supabase.auth.getSession();
      tenantId = session?.user?.app_metadata?.tenant_id;
      if (!tenantId) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        tenantId = refreshed?.session?.user?.app_metadata?.tenant_id;
      }
    }
    if (!tenantId) throw new Error("Sessão expirada. Faça login novamente.");

    // 2. company_id — from store or direct query
    let companyId = company?.id || null;
    if (!companyId) {
      const { data } = await supabase
        .from("companies")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_default", true)
        .maybeSingle();
      companyId = data?.id || null;
    }

    return { tenantId, companyId };
  }

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Step 1
  const [step1, setStep1] = useState<Step1Data>({
    nomeEmpresa: company?.name || "",
    telefone: company?.phone || "",
    descricao: company?.description || "",
    cep: company?.address?.cep || "",
    rua: company?.address?.rua || "",
    numero: company?.address?.numero || "",
    bairro: company?.address?.bairro || "",
    cidade: company?.address?.cidade || "",
    estado: company?.address?.estado || "",
  });

  // Step 2
  const [step2, setStep2] = useState<Step2Data>({
    nome: "",
    telefone: "",
    bio: "",
    comissao: 40,
  });

  // Step 3
  const [step3, setStep3] = useState<Step3Data>({
    categoriaNome: "Cortes",
    servicos: [
      { nome: "", duracao: "30", preco: "" },
      { nome: "", duracao: "30", preco: "" },
    ],
  });

  // Step 4
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [instanceName, setInstanceName] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [pollingStatus, setPollingStatus] = useState(false);

  /* ─── Validation ─── */
  function validateStep1(): boolean {
    const errs: Record<string, string> = {};
    if (!step1.nomeEmpresa.trim()) errs.nomeEmpresa = "Nome obrigatório";
    if (!step1.telefone.trim()) errs.telefone = "Telefone obrigatório";
    if (!step1.cidade.trim()) errs.cidade = "Cidade obrigatória";
    if (!step1.estado.trim()) errs.estado = "Estado obrigatório";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateStep2(): boolean {
    const errs: Record<string, string> = {};
    if (!step2.nome.trim()) errs.nome = "Nome obrigatório";
    if (!step2.telefone.trim()) errs.telefone = "Telefone obrigatório";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateStep3(): boolean {
    const errs: Record<string, string> = {};
    if (!step3.categoriaNome.trim()) errs.categoriaNome = "Nome da categoria obrigatório";
    const validServices = step3.servicos.filter((s) => s.nome.trim());
    if (validServices.length === 0) errs.servicos = "Adicione pelo menos 1 serviço";
    validServices.forEach((s, i) => {
      if (!s.preco || Number(s.preco) <= 0) errs[`preco_${i}`] = "Preço inválido";
      if (!s.duracao || Number(s.duracao) <= 0) errs[`duracao_${i}`] = "Duração inválida";
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  /* ─── Save handlers ─── */
  async function saveStep1() {
    if (!validateStep1()) return false;
    setLoading(true);
    try {
      const supabase = createClient();
      const { tenantId, companyId } = await resolveIds();

      const companyPayload = {
        name: step1.nomeEmpresa,
        phone: step1.telefone.replace(/\D/g, ""),
        description: step1.descricao,
        address: {
          cep: step1.cep,
          rua: step1.rua,
          numero: step1.numero,
          bairro: step1.bairro,
          cidade: step1.cidade,
          estado: step1.estado,
        },
      };

      if (companyId) {
        const { error } = await supabase
          .from("companies")
          .update(companyPayload)
          .eq("id", companyId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("companies")
          .insert({ ...companyPayload, tenant_id: tenantId, is_default: true })
          .select()
          .single();
        if (error) throw error;
      }

      return true;
    } catch (err) {
      console.error("Erro ao salvar empresa:", err);
      const msg = err instanceof Error ? err.message : "Erro ao salvar. Tente novamente.";
      setErrors({ general: msg });
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function saveStep2() {
    if (!validateStep2()) return false;
    setLoading(true);
    try {
      const supabase = createClient();
      const { tenantId, companyId } = await resolveIds();

      const { data: prof, error: profError } = await supabase
        .from("professionals")
        .insert({
          tenant_id: tenantId,
          company_id: companyId,
          name: step2.nome,
          phone: step2.telefone.replace(/\D/g, ""),
          bio: step2.bio,
          commission_pct: step2.comissao,
          active: true,
        })
        .select("id")
        .single();

      if (profError) throw profError;

      const schedules = Array.from({ length: 6 }, (_, i) => ({
        professional_id: prof.id,
        weekday: i + 1,
        start_time: "09:00",
        end_time: "18:00",
      }));

      const { error: schedError } = await supabase
        .from("professional_schedules")
        .insert(schedules);

      if (schedError) throw schedError;
      return true;
    } catch (err) {
      console.error("Erro ao salvar profissional:", err);
      const msg = err instanceof Error ? err.message : "Erro ao salvar. Tente novamente.";
      setErrors({ general: msg });
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function saveStep3() {
    if (!validateStep3()) return false;
    setLoading(true);
    try {
      const supabase = createClient();
      const { tenantId } = await resolveIds();

      const { data: cat, error: catError } = await supabase
        .from("service_categories")
        .insert({
          tenant_id: tenantId,
          name: step3.categoriaNome,
        })
        .select("id")
        .single();

      if (catError) throw catError;

      const validServices = step3.servicos.filter((s) => s.nome.trim());
      const services = validServices.map((s) => ({
        tenant_id: tenantId,
        category_id: cat.id,
        name: s.nome,
        duration_min: Number(s.duracao),
        price: Number(s.preco),
        promo_active: false,
        active: true,
      }));

      const { error: svcError } = await supabase.from("services").insert(services);
      if (svcError) throw svcError;
      return true;
    } catch (err) {
      console.error("Erro ao salvar serviços:", err);
      const msg = err instanceof Error ? err.message : "Erro ao salvar. Tente novamente.";
      setErrors({ general: msg });
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function finishOnboarding() {
    setLoading(true);
    try {
      const supabase = createClient();

      // Get user id from store or auth session
      let userId = user?.id;
      if (!userId) {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        userId = authUser?.id;
      }
      if (!userId) throw new Error("Usuário não encontrado.");

      const { error } = await supabase
        .from("users")
        .update({ onboarding_completed: true })
        .eq("id", userId);
      if (error) throw error;

      if (user) {
        setUser({ ...user, onboarding_completed: true });
      }
      router.push("/dashboard");
    } catch (err) {
      console.error("Erro ao finalizar onboarding:", err);
    } finally {
      setLoading(false);
    }
  }

  async function connectWhatsApp() {
    if (!instanceName.trim()) {
      setWhatsappError("Digite um nome para a instância");
      return;
    }
    if (!whatsappPhone.trim() || whatsappPhone.replace(/\D/g, "").length < 10) {
      setWhatsappError("Digite um número de telefone válido (com DDD)");
      return;
    }

    setLoading(true);
    setWhatsappError(null);
    setPairCode(null);

    try {
      // API route reads tenant_id from user cookie session — no special headers needed
      const res = await fetch("/api/whatsapp/create-instance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instance_name: instanceName.trim(),
          phone: whatsappPhone.replace(/\D/g, ""),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao criar instância");
      }

      if (data.data?.pair_code) {
        setPairCode(data.data.pair_code);
        startStatusPolling();
      } else {
        setWhatsappError("Código de pareamento não recebido. Tente novamente.");
      }
    } catch (err) {
      console.error("Erro ao conectar WhatsApp:", err);
      setWhatsappError(err instanceof Error ? err.message : "Erro ao conectar");
    } finally {
      setLoading(false);
    }
  }

  function startStatusPolling() {
    setPollingStatus(true);
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes (every 5s)

    const interval = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        setPollingStatus(false);
        setWhatsappError("Tempo esgotado. Tente conectar novamente.");
        return;
      }

      try {
        const res = await fetch("/api/whatsapp/status");
        const data = await res.json();
        if (data.data?.status === "connected") {
          clearInterval(interval);
          setPollingStatus(false);
          setPairCode(null);
          setWhatsappConnected(true);
        }
      } catch {
        // Ignore polling errors
      }
    }, 5000);
  }

  /* ─── Navigation ─── */
  async function handleNext() {
    let success = true;
    if (currentStep === 0) success = await saveStep1();
    else if (currentStep === 1) success = await saveStep2();
    else if (currentStep === 2) success = await saveStep3();
    else if (currentStep === 3) {
      await finishOnboarding();
      return;
    }

    if (success && currentStep < 3) {
      setErrors({});
      setCurrentStep((s) => s + 1);
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setErrors({});
      setCurrentStep((s) => s - 1);
    }
  }

  /* ─── Service helpers ─── */
  function addService() {
    if (step3.servicos.length >= 5) return;
    setStep3((prev) => ({
      ...prev,
      servicos: [...prev.servicos, { nome: "", duracao: "30", preco: "" }],
    }));
  }

  function removeService(index: number) {
    if (step3.servicos.length <= 1) return;
    setStep3((prev) => ({
      ...prev,
      servicos: prev.servicos.filter((_, i) => i !== index),
    }));
  }

  function updateService(index: number, field: keyof ServiceItem, value: string) {
    setStep3((prev) => ({
      ...prev,
      servicos: prev.servicos.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    }));
  }

  /* ─── Render ─── */
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <div className="w-full max-w-[640px]">
        {/* Card */}
        <div className="rounded-card bg-surface-container-lowest shadow-card overflow-hidden">
          {/* Progress bar */}
          <div className="relative h-1.5 w-full bg-amber-100">
            <div
              className="absolute left-0 top-0 h-full bg-amber-500 transition-all duration-500"
              style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
            />
          </div>

          {/* Steps indicator */}
          <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const isActive = i === currentStep;
              const isDone = i < currentStep;
              return (
                <div
                  key={step.label}
                  className={cn(
                    "flex items-center gap-2 text-sm font-medium transition-colors",
                    isActive && "text-amber-600",
                    isDone && "text-emerald-600",
                    !isActive && !isDone && "text-muted-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                      isActive && "bg-amber-100 text-amber-600",
                      isDone && "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600",
                      !isActive && !isDone && "bg-muted text-muted-foreground"
                    )}
                  >
                    {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span className="hidden sm:inline">{step.label}</span>
                </div>
              );
            })}
          </div>

          {/* Content */}
          <div className="p-6 sm:p-8">
            {/* Error general */}
            {errors.general && (
              <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600">
                {errors.general}
              </div>
            )}

            {/* Step 1: Dados da Empresa */}
            {currentStep === 0 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Dados da Empresa</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Informações básicas do seu estabelecimento
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Nome da empresa *
                    </label>
                    <input
                      type="text"
                      value={step1.nomeEmpresa}
                      onChange={(e) => setStep1((s) => ({ ...s, nomeEmpresa: e.target.value }))}
                      className={cn(
                        "w-full rounded-lg border bg-surface-container-lowest px-3 py-2.5 text-sm outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500",
                        errors.nomeEmpresa ? "border-red-400" : "border-border"
                      )}
                      placeholder="Ex: Barbearia Premium"
                    />
                    {errors.nomeEmpresa && (
                      <p className="mt-1 text-xs text-red-500">{errors.nomeEmpresa}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-foreground">
                        Telefone *
                      </label>
                      <input
                        type="tel"
                        value={step1.telefone}
                        onChange={(e) => setStep1((s) => ({ ...s, telefone: maskPhone(e.target.value) }))}
                        className={cn(
                          "w-full rounded-lg border bg-surface-container-lowest px-3 py-2.5 text-sm outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500",
                          errors.telefone ? "border-red-400" : "border-border"
                        )}
                        placeholder="+55 (11) 99999-0000"
                      />
                      {errors.telefone && (
                        <p className="mt-1 text-xs text-red-500">{errors.telefone}</p>
                      )}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-foreground">
                        CEP
                      </label>
                      <input
                        type="text"
                        value={step1.cep}
                        onChange={async (e) => {
                          const masked = maskCep(e.target.value);
                          setStep1((s) => ({ ...s, cep: masked }));
                          const digits = masked.replace(/\D/g, "");
                          if (digits.length === 8) {
                            const addr = await fetchCep(digits);
                            if (addr) {
                              setStep1((prev) => ({ ...prev, cep: masked, rua: addr.rua, bairro: addr.bairro, cidade: addr.cidade, estado: addr.estado }));
                            }
                          }
                        }}
                        className="w-full rounded-lg border border-border bg-surface-container-lowest px-3 py-2.5 text-sm outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        placeholder="00000-000"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-sm font-medium text-foreground">
                        Rua
                      </label>
                      <input
                        type="text"
                        value={step1.rua}
                        onChange={(e) => setStep1((s) => ({ ...s, rua: e.target.value }))}
                        className="w-full rounded-lg border border-border bg-surface-container-lowest px-3 py-2.5 text-sm outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        placeholder="Rua das Flores"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-foreground">
                        Número
                      </label>
                      <input
                        type="text"
                        value={step1.numero}
                        onChange={(e) => setStep1((s) => ({ ...s, numero: e.target.value }))}
                        className="w-full rounded-lg border border-border bg-surface-container-lowest px-3 py-2.5 text-sm outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        placeholder="123"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-foreground">
                        Bairro
                      </label>
                      <input
                        type="text"
                        value={step1.bairro}
                        onChange={(e) => setStep1((s) => ({ ...s, bairro: e.target.value }))}
                        className="w-full rounded-lg border border-border bg-surface-container-lowest px-3 py-2.5 text-sm outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        placeholder="Centro"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-foreground">
                        Cidade *
                      </label>
                      <input
                        type="text"
                        value={step1.cidade}
                        onChange={(e) => setStep1((s) => ({ ...s, cidade: e.target.value }))}
                        className={cn(
                          "w-full rounded-lg border bg-surface-container-lowest px-3 py-2.5 text-sm outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500",
                          errors.cidade ? "border-red-400" : "border-border"
                        )}
                        placeholder="São Paulo"
                      />
                      {errors.cidade && (
                        <p className="mt-1 text-xs text-red-500">{errors.cidade}</p>
                      )}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-foreground">
                        Estado *
                      </label>
                      <select
                        value={step1.estado}
                        onChange={(e) => setStep1((s) => ({ ...s, estado: e.target.value }))}
                        className={cn(
                          "w-full rounded-xl border bg-surface px-4 py-2.5 text-sm outline-none transition-colors focus:border-amber-400",
                          errors.estado ? "border-red-400" : "border-border"
                        )}
                      >
                        <option value="">Selecione o estado</option>
                        {ESTADOS_BR.map((e) => (
                          <option key={e.uf} value={e.uf}>{e.uf} - {e.nome}</option>
                        ))}
                      </select>
                      {errors.estado && (
                        <p className="mt-1 text-xs text-red-500">{errors.estado}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Descrição
                    </label>
                    <textarea
                      value={step1.descricao}
                      onChange={(e) => setStep1((s) => ({ ...s, descricao: e.target.value }))}
                      rows={3}
                      className="w-full resize-none rounded-lg border border-border bg-surface-container-lowest px-3 py-2.5 text-sm outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                      placeholder="Breve descrição do seu estabelecimento..."
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Primeiro Profissional */}
            {currentStep === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Primeiro Profissional</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cadastre o primeiro profissional da equipe
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Nome *
                    </label>
                    <input
                      type="text"
                      value={step2.nome}
                      onChange={(e) => setStep2((s) => ({ ...s, nome: e.target.value }))}
                      className={cn(
                        "w-full rounded-lg border bg-surface-container-lowest px-3 py-2.5 text-sm outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500",
                        errors.nome ? "border-red-400" : "border-border"
                      )}
                      placeholder="Nome completo"
                    />
                    {errors.nome && <p className="mt-1 text-xs text-red-500">{errors.nome}</p>}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Telefone *
                    </label>
                    <input
                      type="tel"
                      value={step2.telefone}
                      onChange={(e) => setStep2((s) => ({ ...s, telefone: maskPhone(e.target.value) }))}
                      className={cn(
                        "w-full rounded-lg border bg-surface-container-lowest px-3 py-2.5 text-sm outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500",
                        errors.telefone ? "border-red-400" : "border-border"
                      )}
                      placeholder="+55 (11) 99999-0000"
                    />
                    {errors.telefone && (
                      <p className="mt-1 text-xs text-red-500">{errors.telefone}</p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Bio / Especialidade
                    </label>
                    <textarea
                      value={step2.bio}
                      onChange={(e) => setStep2((s) => ({ ...s, bio: e.target.value }))}
                      rows={2}
                      className="w-full resize-none rounded-lg border border-border bg-surface-container-lowest px-3 py-2.5 text-sm outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                      placeholder="Ex: Especialista em degradê e barba..."
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Comissão: {step2.comissao}%
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={step2.comissao}
                      onChange={(e) =>
                        setStep2((s) => ({ ...s, comissao: Number(e.target.value) }))
                      }
                      className="w-full accent-amber-500"
                    />
                    <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                      <span>0%</span>
                      <span>50%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Primeiros Serviços */}
            {currentStep === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Primeiros Serviços</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Configure os serviços que você oferece
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Categoria *
                    </label>
                    <input
                      type="text"
                      value={step3.categoriaNome}
                      onChange={(e) =>
                        setStep3((s) => ({ ...s, categoriaNome: e.target.value }))
                      }
                      className={cn(
                        "w-full rounded-lg border bg-surface-container-lowest px-3 py-2.5 text-sm outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500",
                        errors.categoriaNome ? "border-red-400" : "border-border"
                      )}
                      placeholder="Ex: Cortes, Barba, Tratamentos..."
                    />
                    {errors.categoriaNome && (
                      <p className="mt-1 text-xs text-red-500">{errors.categoriaNome}</p>
                    )}
                  </div>

                  {errors.servicos && (
                    <p className="text-xs text-red-500">{errors.servicos}</p>
                  )}

                  <div className="space-y-3">
                    {step3.servicos.map((servico, index) => (
                      <div
                        key={index}
                        className="rounded-lg border border-border bg-muted/30 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">
                            Serviço {index + 1}
                          </span>
                          {step3.servicos.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeService(index)}
                              className="text-red-400 transition-colors hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div className="sm:col-span-1">
                            <input
                              type="text"
                              value={servico.nome}
                              onChange={(e) => updateService(index, "nome", e.target.value)}
                              className="w-full rounded-lg border border-border bg-surface-container-lowest px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                              placeholder="Nome"
                            />
                          </div>
                          <div>
                            <div className="relative">
                              <input
                                type="number"
                                value={servico.duracao}
                                onChange={(e) => updateService(index, "duracao", e.target.value)}
                                className="w-full rounded-lg border border-border bg-surface-container-lowest px-3 py-2 pr-10 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                                placeholder="Duração"
                                min={5}
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                min
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                R$
                              </span>
                              <input
                                type="number"
                                value={servico.preco}
                                onChange={(e) => updateService(index, "preco", e.target.value)}
                                className="w-full rounded-lg border border-border bg-surface-container-lowest py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                                placeholder="0,00"
                                min={0}
                                step={0.01}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {step3.servicos.length < 5 && (
                    <button
                      type="button"
                      onClick={addService}
                      className="flex items-center gap-1.5 text-sm font-medium text-amber-600 transition-colors hover:text-amber-700"
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar serviço
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Conectar WhatsApp */}
            {currentStep === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Conectar WhatsApp</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Conecte o WhatsApp para atendimento automatizado
                  </p>
                </div>

                {whatsappConnected ? (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                      <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                    </div>
                    <p className="text-lg font-medium text-emerald-700">WhatsApp conectado!</p>
                    <p className="text-sm text-muted-foreground">Seu atendimento automatizado está pronto.</p>
                  </div>
                ) : pairCode ? (
                  <div className="flex flex-col items-center gap-5 py-4">
                    {/* Pairing code display */}
                    <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 px-8 py-6">
                      <p className="mb-2 text-center text-sm font-medium text-emerald-800">Código de pareamento:</p>
                      <p className="text-center text-3xl font-bold tracking-[0.3em] text-emerald-700">{pairCode}</p>
                    </div>

                    <div className="w-full max-w-sm space-y-2 rounded-lg bg-muted/30 p-4">
                      <p className="text-sm font-medium text-foreground">Como conectar:</p>
                      <ol className="space-y-1.5 text-sm text-muted-foreground">
                        <li>1. Abra o <strong>WhatsApp</strong> no celular</li>
                        <li>2. Vá em <strong>Configurações &gt; Dispositivos conectados</strong></li>
                        <li>3. Toque em <strong>Conectar dispositivo</strong></li>
                        <li>4. Toque em <strong>Conectar com número de telefone</strong></li>
                        <li>5. Digite o código acima</li>
                      </ol>
                    </div>

                    {pollingStatus && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Aguardando conexão...
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 py-2">
                    {/* Instance name */}
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-foreground">
                        Nome da instância
                      </label>
                      <input
                        type="text"
                        value={instanceName}
                        onChange={(e) => setInstanceName(e.target.value)}
                        placeholder="Ex: Minha Barbearia"
                        className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none transition-colors focus:border-amber-400"
                      />
                    </div>

                    {/* Phone number */}
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-foreground">
                        Número do WhatsApp (com DDD)
                      </label>
                      <input
                        type="tel"
                        value={whatsappPhone}
                        onChange={(e) => setWhatsappPhone(maskPhone(e.target.value))}
                        placeholder="+55 (11) 99999-0000"
                        className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none transition-colors focus:border-amber-400"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        O número que seus clientes usarão para entrar em contato
                      </p>
                    </div>

                    {whatsappError && (
                      <p className="text-sm text-red-500">{whatsappError}</p>
                    )}

                    <div className="flex flex-col items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={connectWhatsApp}
                        disabled={loading}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MessageCircle className="h-4 w-4" />
                        )}
                        Gerar código de conexão
                      </button>
                    </div>
                  </div>
                )}

                {!whatsappConnected && (
                  <div className="flex justify-center pt-2">
                    <button
                      type="button"
                      onClick={finishOnboarding}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Pular por agora
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-between border-t border-border/50 px-6 py-4 sm:px-8">
            <div>
              {currentStep > 0 && currentStep < 3 && (
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Voltar
                </button>
              )}
            </div>

            <div>
              {currentStep < 3 && (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Próximo
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              )}
              {currentStep === 3 && whatsappConnected && (
                <button
                  type="button"
                  onClick={finishOnboarding}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Finalizar
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
