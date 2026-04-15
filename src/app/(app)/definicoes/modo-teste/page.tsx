"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FlaskConical,
  Phone,
  X,
  Loader2,
  Check,
  ToggleLeft,
  ToggleRight,
  Info,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenantStore } from "@/stores/tenant-store";

interface TestModeData {
  test_mode: boolean;
  test_numbers: string[];
  has_connected_session: boolean;
}

export default function ModoTestePage() {
  const { tenant } = useTenantStore();
  const tenantId = tenant?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [testMode, setTestMode] = useState(false);
  const [testNumbers, setTestNumbers] = useState<string[]>([]);
  const [hasConnectedSession, setHasConnectedSession] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch("/api/settings/test-mode");
      if (!res.ok) throw new Error("Erro ao carregar configuracoes");
      const json = await res.json();
      const data: TestModeData = json.data ?? json;
      setTestMode(data.test_mode);
      setTestNumbers(data.test_numbers ?? []);
      setHasConnectedSession(data.has_connected_session);
    } catch {
      setError("Erro ao carregar configuracoes");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggle = async () => {
    if (!hasConnectedSession && !testMode) return;
    const next = !testMode;
    setTestMode(next);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/test-mode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test_mode: testMode, test_numbers: testNumbers }),
      });
      if (!res.ok) {
        const body = await res.json();
        if ((body.error as string)?.includes("session_not_connected")) {
          setError("Conecte o WhatsApp antes de ativar o Modo Teste.");
          setTestMode(false);
          return;
        }
        throw new Error(body.error || "Erro ao salvar");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar configuracoes");
    } finally {
      setSaving(false);
    }
  };

  const addPhone = () => {
    const value = phoneInput.trim().replace(/\D/g, "");
    if (value && !testNumbers.includes(value)) {
      setTestNumbers((prev) => [...prev, value]);
      setPhoneInput("");
    }
  };

  const removePhone = (phone: string) => {
    setTestNumbers((prev) => prev.filter((p) => p !== phone));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  const toggleDisabled = !hasConnectedSession && !testMode;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
            <FlaskConical className="h-5 w-5 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-headline text-foreground">Modo Teste</h1>
            <p className="text-sm text-muted-foreground">Restrinja o bot e a IA a numeros autorizados</p>
          </div>
        </div>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <Check className="h-4 w-4" />
            Salvo
          </span>
        )}
      </div>

      {/* No connection warning */}
      {!hasConnectedSession && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" strokeWidth={1.5} />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Voce precisa ter uma conexao WhatsApp ativa para ativar o Modo Teste.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Main toggle card */}
      <div className="rounded-card bg-surface-container-lowest p-6 shadow-card">
        <div className="flex items-center justify-between">
          <div className="flex-1 pr-4">
            <h3 className="font-semibold text-foreground">Ativar Modo Teste</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Quando ativado, o chatbot e a IA so responderao para os numeros cadastrados abaixo.
              Mensagens de outros numeros serao recebidas e registradas, mas nao terao resposta automatica.
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={toggleDisabled}
            className={cn("shrink-0", toggleDisabled && "opacity-40 cursor-not-allowed")}
            title={toggleDisabled ? "Conecte o WhatsApp primeiro" : undefined}
          >
            {testMode ? (
              <ToggleRight className="h-10 w-10 text-amber-500" />
            ) : (
              <ToggleLeft className="h-10 w-10 text-muted-foreground" />
            )}
          </button>
        </div>

        {testMode && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5">
            <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" strokeWidth={1.5} />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Modo Teste ativo — apenas os numeros da lista abaixo receberao respostas automaticas.
            </p>
          </div>
        )}
      </div>

      {/* Phone numbers card */}
      <div className="rounded-card bg-surface-container-lowest p-6 shadow-card space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">Numeros autorizados</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Adicione os numeros que poderao interagir com o bot durante o modo teste.
            O formato pode ser com ou sem codigo do pais (ex: 5511999990001 ou 11999990001).
          </p>
        </div>

        {/* Chips */}
        {testNumbers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {testNumbers.map((phone) => (
              <span
                key={phone}
                className="flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-1 text-sm"
              >
                <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                <span>{phone}</span>
                <button
                  onClick={() => removePhone(phone)}
                  className="hover:text-red-500 transition-colors"
                  aria-label={`Remover ${phone}`}
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </span>
            ))}
          </div>
        )}

        {testNumbers.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            Nenhum numero cadastrado. {testMode ? "Adicione ao menos um numero para o modo teste funcionar." : ""}
          </p>
        )}

        {/* Add phone input */}
        <div className="flex gap-2">
          <input
            type="tel"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPhone()}
            placeholder="Ex: 5511999990001"
            className="flex-1 rounded-lg border border-border bg-surface-container-lowest px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          />
          <button
            onClick={addPhone}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition"
          >
            Adicionar
          </button>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
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
  );
}
