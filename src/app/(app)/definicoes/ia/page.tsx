"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Sparkles,
  Zap,
  DollarSign,
  Calendar,
  ToggleLeft,
  ToggleRight,
  Upload,
  X,
  Phone,
  Loader2,
  Check,
  Lock,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useTenantStore } from "@/stores/tenant-store";
import { createClient } from "@/lib/supabase/client";
// Plan type used for checking has_ia gate
// import type { Plan } from "@/types/database";

type TomDeVoz = "formal" | "humorado" | "educado" | "simpatico";

const tonsDeVoz: { id: TomDeVoz; label: string }[] = [
  { id: "formal", label: "Formal" },
  { id: "humorado", label: "Bem humorado" },
  { id: "educado", label: "Educado" },
  { id: "simpatico", label: "Simpatico" },
];

interface IASettings {
  enabled: boolean;
  tone: TomDeVoz;
  instructions: string;
  knowledge_base_url: string | null;
  test_mode: boolean;
  test_numbers: string[];
  handoff_keywords: string[];
}

interface IAUsage {
  tokens_input: number;
  tokens_output: number;
  cost_brl: number;
  period_start: string;
}

const DEFAULT_SETTINGS: IASettings = {
  enabled: true,
  tone: "educado",
  instructions: "",
  knowledge_base_url: null,
  test_mode: false,
  test_numbers: [],
  handoff_keywords: [],
};

const TOKEN_LIMIT = 100000;

export default function DefinicoesIAPage() {
  const { tenant } = useTenantStore();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<IASettings>(DEFAULT_SETTINGS);
  const [usage, setUsage] = useState<IAUsage | null>(null);

  const [phoneInput, setPhoneInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [hasIa, setHasIa] = useState<boolean | null>(null);
  const [uploadingKB, setUploadingKB] = useState(false);
  const [kbUploadError, setKbUploadError] = useState<string | null>(null);

  const tenantId = tenant?.id;

  // Fetch settings and usage
  const fetchData = useCallback(async () => {
    if (!tenantId) return;

    try {
      // Check if tenant's plan has IA access
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("plan_id")
        .eq("tenant_id", tenantId)
        .single();

      if (subData?.plan_id) {
        const { data: planData } = await supabase
          .from("plans")
          .select("has_ia")
          .eq("id", subData.plan_id)
          .single();
        setHasIa(planData?.has_ia ?? false);
      } else {
        // No subscription found — check tenant plan directly
        const tenantPlan = tenant?.plan;
        setHasIa(tenantPlan === "ia");
      }

      const [settingsRes, usageRes] = await Promise.all([
        supabase
          .from("ia_settings")
          .select("*")
          .eq("tenant_id", tenantId)
          .single(),
        supabase
          .from("ia_usage")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("period_start", { ascending: false })
          .limit(1),
      ]);

      if (settingsRes.data) {
        setSettings({
          enabled: settingsRes.data.enabled ?? true,
          tone: settingsRes.data.tone || "educado",
          instructions: settingsRes.data.instructions || "",
          knowledge_base_url: settingsRes.data.knowledge_base_url || null,
          test_mode: settingsRes.data.test_mode ?? false,
          test_numbers: settingsRes.data.test_numbers || [],
          handoff_keywords: settingsRes.data.handoff_keywords || [],
        });
      }

      if (usageRes.data && usageRes.data.length > 0) {
        setUsage(usageRes.data[0]);
      }
    } catch {
      setError("Erro ao carregar configuracoes");
    } finally {
      setLoading(false);
    }
  }, [tenantId, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Save settings
  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const { error: upsertError } = await supabase
        .from("ia_settings")
        .upsert({
          tenant_id: tenantId,
          enabled: settings.enabled,
          tone: settings.tone,
          instructions: settings.instructions,
          knowledge_base_url: settings.knowledge_base_url,
          test_mode: settings.test_mode,
          test_numbers: settings.test_numbers,
          handoff_keywords: settings.handoff_keywords,
        }, { onConflict: "tenant_id" });

      if (upsertError) throw upsertError;

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Erro ao salvar configuracoes");
    } finally {
      setSaving(false);
    }
  };

  const addPhoneChip = () => {
    const value = phoneInput.trim();
    if (value && !settings.test_numbers.includes(value)) {
      setSettings({ ...settings, test_numbers: [...settings.test_numbers, value] });
      setPhoneInput("");
    }
  };

  const removePhoneChip = (phone: string) => {
    setSettings({ ...settings, test_numbers: settings.test_numbers.filter((p) => p !== phone) });
  };

  const addKeyword = () => {
    const value = keywordInput.trim();
    if (value && !settings.handoff_keywords.includes(value)) {
      setSettings({ ...settings, handoff_keywords: [...settings.handoff_keywords, value] });
      setKeywordInput("");
    }
  };

  const removeKeyword = (kw: string) => {
    setSettings({ ...settings, handoff_keywords: settings.handoff_keywords.filter((k) => k !== kw) });
  };

  const KB_ALLOWED_TYPES = [
    "application/pdf",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  const KB_ALLOWED_EXTENSIONS = [".pdf", ".txt", ".docx"];
  const KB_MAX_SIZE = 5 * 1024 * 1024; // 5MB

  const handleKBFileUpload = async (file: File) => {
    setKbUploadError(null);

    // Validate file type
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    if (!KB_ALLOWED_TYPES.includes(file.type) && !KB_ALLOWED_EXTENSIONS.includes(ext)) {
      setKbUploadError("Tipo de arquivo nao permitido. Use PDF, TXT ou DOCX.");
      return;
    }

    // Validate file size
    if (file.size > KB_MAX_SIZE) {
      setKbUploadError("Arquivo muito grande. Tamanho maximo: 5MB.");
      return;
    }

    if (!tenantId) return;
    setUploadingKB(true);

    try {
      // Upload to Supabase Storage
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const path = `${tenantId}/knowledge-base/${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        setKbUploadError(uploadError.message);
        return;
      }

      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(path);
      setSettings({ ...settings, knowledge_base_url: urlData.publicUrl });
    } catch {
      setKbUploadError("Erro ao fazer upload do arquivo.");
    } finally {
      setUploadingKB(false);
    }
  };

  const totalTokens = usage ? usage.tokens_input + usage.tokens_output : 0;
  const tokenPercent = Math.min(Math.round((totalTokens / TOKEN_LIMIT) * 100), 100);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  const planLocked = hasIa === false;

  return (
    <div className="space-y-6">
      {/* Plan gate banner */}
      {planLocked && (
        <div
          data-testid="plan-gate-banner"
          className="relative rounded-card border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-900/20 p-6 shadow-card"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
              <Lock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">
                Este recurso esta disponivel no plano IA
              </h3>
              <p className="text-sm text-muted-foreground">
                Faca upgrade do seu plano para desbloquear a inteligencia artificial.
              </p>
            </div>
            <Link
              href="/conta/planos"
              data-testid="upgrade-button"
              className="rounded-btn bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-amber-600 hover:shadow-float"
            >
              Fazer upgrade
            </Link>
          </div>
        </div>
      )}

      <div className={cn("flex items-center justify-between", planLocked && "opacity-50 pointer-events-none")}>
        <h1 className="text-headline text-foreground">Definicoes da IA</h1>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <Check className="h-4 w-4" />
              Salvo
            </span>
          )}
          <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            <Sparkles className="h-3.5 w-3.5" />
            Plano IA
          </span>
        </div>
      </div>

      <div className={cn(planLocked && "opacity-50 pointer-events-none select-none")}>
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Row 1: Mini dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-card bg-surface-container-lowest p-4 shadow-card space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Zap className="h-4 w-4" />
            Tokens consumidos
          </div>
          <p className="text-xl font-bold text-foreground">
            {totalTokens.toLocaleString("pt-BR")} / {TOKEN_LIMIT.toLocaleString("pt-BR")}
          </p>
          <div className="h-2 w-full rounded-full bg-surface-container">
            <div
              className="h-2 rounded-full bg-amber-500 transition-all"
              style={{ width: `${tokenPercent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{tokenPercent}% utilizado este mes</p>
        </div>

        <div className="rounded-card bg-surface-container-lowest p-4 shadow-card space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            Custo estimado
          </div>
          <p className="text-xl font-bold text-foreground">
            {formatCurrency(usage?.cost_brl || 0)}
          </p>
          <p className="text-xs text-muted-foreground">Baseado no consumo atual</p>
        </div>

        <div className="rounded-card bg-surface-container-lowest p-4 shadow-card space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Periodo
          </div>
          <p className="text-xl font-bold text-foreground">
            {usage?.period_start
              ? new Date(usage.period_start).toLocaleDateString("pt-BR")
              : "—"}
          </p>
          <p className="text-xs text-muted-foreground">Inicio do ciclo atual</p>
        </div>
      </div>

      {/* Row 2: Master toggle */}
      <div className="rounded-card bg-surface-container-lowest p-6 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">IA ativada</h3>
            <p className="text-sm text-muted-foreground">A IA respondera automaticamente as mensagens dos clientes</p>
          </div>
          <button onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}>
            {settings.enabled ? (
              <ToggleRight className="h-10 w-10 text-amber-500" />
            ) : (
              <ToggleLeft className="h-10 w-10 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      {/* Row 3: Tom de voz */}
      <div className="rounded-card bg-surface-container-lowest p-6 shadow-card space-y-3">
        <h3 className="font-semibold text-foreground">Tom de voz</h3>
        <p className="text-sm text-muted-foreground">Selecione o estilo de comunicacao da IA</p>
        <div className="flex flex-wrap gap-2">
          {tonsDeVoz.map((tom) => (
            <button
              key={tom.id}
              onClick={() => setSettings({ ...settings, tone: tom.id })}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition",
                settings.tone === tom.id
                  ? "bg-amber-500 text-white"
                  : "bg-surface-container text-muted-foreground hover:bg-surface-container"
              )}
            >
              {tom.label}
            </button>
          ))}
        </div>
      </div>

      {/* Row 4: Observacoes + Base de conhecimento */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-card bg-surface-container-lowest p-6 shadow-card space-y-3">
          <h3 className="font-semibold text-foreground">Observacoes</h3>
          <p className="text-sm text-muted-foreground">Instrucoes adicionais para a IA seguir</p>
          <textarea
            value={settings.instructions}
            onChange={(e) => setSettings({ ...settings, instructions: e.target.value })}
            rows={6}
            className="w-full rounded-lg border border-border bg-surface-container-lowest px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          />
        </div>

        <div className="rounded-card bg-surface-container-lowest p-6 shadow-card space-y-3">
          <h3 className="font-semibold text-foreground">Base de conhecimento</h3>
          <p className="text-sm text-muted-foreground">Envie arquivos para a IA usar como referencia</p>

          {/* URL input */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">URL do arquivo</label>
            <input
              type="url"
              value={settings.knowledge_base_url || ""}
              onChange={(e) => setSettings({ ...settings, knowledge_base_url: e.target.value || null })}
              placeholder="https://exemplo.com/base.pdf"
              className="mt-1 w-full rounded-lg border border-border bg-surface-container-lowest px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </div>

          {/* File upload section */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Ou faca upload de um arquivo</label>
            <div
              className="mt-1 flex flex-col items-center justify-center h-32 rounded-xl border-2 border-dashed border-border bg-surface-container-low hover:border-amber-400 transition cursor-pointer relative"
              onClick={() => document.getElementById("kb-file-input")?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files?.[0];
                if (file) handleKBFileUpload(file);
              }}
            >
              {uploadingKB ? (
                <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                  <p className="text-xs text-muted-foreground">Arraste ou clique para enviar</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">PDF, TXT, DOCX (max. 5MB)</p>
                </>
              )}
              <input
                id="kb-file-input"
                type="file"
                accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleKBFileUpload(file);
                  e.target.value = "";
                }}
              />
            </div>
            {kbUploadError && (
              <p className="mt-1 text-xs text-red-500">{kbUploadError}</p>
            )}
          </div>

          {settings.knowledge_base_url && (
            <div className="flex items-center gap-2">
              <Check className="h-3 w-3 text-green-600" />
              <p className="text-xs text-green-600 truncate flex-1">
                Arquivo: {settings.knowledge_base_url}
              </p>
              <button
                onClick={() => setSettings({ ...settings, knowledge_base_url: null })}
                className="text-xs text-red-400 hover:text-red-600"
              >
                Remover
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Row 5: Modo teste */}
      <div className="rounded-card bg-surface-container-lowest p-6 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Modo teste</h3>
            <p className="text-sm text-muted-foreground">A IA so respondera para os numeros abaixo</p>
          </div>
          <button onClick={() => setSettings({ ...settings, test_mode: !settings.test_mode })}>
            {settings.test_mode ? (
              <ToggleRight className="h-8 w-8 text-amber-500" />
            ) : (
              <ToggleLeft className="h-8 w-8 text-muted-foreground" />
            )}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {settings.test_numbers.map((phone) => (
            <span key={phone} className="flex items-center gap-1 rounded-full bg-surface-container px-3 py-1 text-sm">
              <Phone className="h-3 w-3 text-muted-foreground" />
              {phone}
              <button onClick={() => removePhoneChip(phone)}>
                <X className="h-3 w-3 text-muted-foreground hover:text-red-500" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPhoneChip()}
            placeholder="Adicionar numero..."
            className="flex-1 rounded-lg border border-border bg-surface-container-lowest px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          />
          <button
            onClick={addPhoneChip}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 transition"
          >
            Adicionar
          </button>
        </div>
      </div>

      {/* Row 6: Handoff */}
      <div className="rounded-card bg-surface-container-lowest p-6 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Handoff (transferir para humano)</h3>
            <p className="text-sm text-muted-foreground">Quando detectar estas palavras-chave, a IA para de responder e notifica voce</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {settings.handoff_keywords.map((kw) => (
            <span key={kw} className="flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/20 px-3 py-1 text-sm text-red-700">
              {kw}
              <button onClick={() => removeKeyword(kw)}>
                <X className="h-3 w-3 text-red-400 hover:text-red-600" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addKeyword()}
            placeholder="Adicionar palavra-chave..."
            className="flex-1 rounded-lg border border-border bg-surface-container-lowest px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          />
          <button
            onClick={addKeyword}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 transition"
          >
            Adicionar
          </button>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || planLocked}
          className="flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-3 text-sm font-medium text-white hover:bg-amber-600 transition disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : null}
          {saving ? "Salvando..." : "Salvar configuracoes"}
        </button>
      </div>
      </div>
    </div>
  );
}
