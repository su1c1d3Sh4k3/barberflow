"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw,
  Smartphone,
  Wifi,
  WifiOff,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  MessageCircle,
  CheckCircle2,
  Webhook,
  Bug,
} from "lucide-react";
import { useTenantStore } from "@/stores/tenant-store";
import { maskPhone } from "@/lib/masks";
import { createClient } from "@/lib/supabase/client";

interface MessageLog {
  id: string;
  created_at: string;
  direction: "in" | "out";
  content: string;
}

type SessionStatus = "connected" | "disconnected" | "connecting";

export default function WhatsAppPage() {
  const { tenant } = useTenantStore();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<SessionStatus>("disconnected");
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [instanceName, setInstanceName] = useState("");
  const [phone, setPhone] = useState("");
  const [webhookStatus, setWebhookStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [webhookMsg, setWebhookMsg] = useState<string | null>(null);
  const [diagData, setDiagData] = useState<Record<string, unknown> | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState<Record<string, unknown> | null>(null);
  const [webhookInfoLoading, setWebhookInfoLoading] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tenantId = tenant?.id;

  // Fetch session from DB
  const fetchSession = useCallback(async () => {
    if (!tenantId) return;
    try {
      const { data } = await supabase
        .from("whatsapp_sessions")
        .select("status, phone_number, instance_id")
        .eq("tenant_id", tenantId)
        .single();

      if (data) {
        setStatus((data.status as SessionStatus) || "disconnected");
        setPhoneNumber(data.phone_number || null);
        if (data.instance_id) setInstanceName(data.instance_id);
      }
    } catch {
      // No session
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const fetchLogs = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("messages")
      .select("id, created_at, direction, content")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setLogs(data as MessageLog[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => { fetchSession(); }, [fetchSession]);
  useEffect(() => { if (status === "connected") fetchLogs(); }, [status, fetchLogs]);

  // Cleanup polling
  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  // Poll uazapi status via our API
  function startPolling() {
    if (pollingRef.current) clearInterval(pollingRef.current);
    let attempts = 0;

    pollingRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 60) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        setConnecting(false);
        setError("Tempo esgotado. Tente novamente.");
        return;
      }
      try {
        const res = await fetch("/api/whatsapp/status");
        const json = await res.json();
        if (json.data?.status === "connected") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setStatus("connected");
          setPhoneNumber(json.data.phone_number);
          setPairCode(null);
          setConnecting(false);
          fetchLogs();
        }
      } catch { /* ignore */ }
    }, 5000);
  }

  // Connect: create instance + get pairing code
  async function handleConnect() {
    if (!instanceName.trim()) { setError("Digite um nome para a instância"); return; }
    if (!phone.trim() || phone.replace(/\D/g, "").length < 10) {
      setError("Digite um número válido com DDD (ex: 11999999999)");
      return;
    }

    setConnecting(true);
    setError(null);
    setPairCode(null);

    try {
      const res = await fetch("/api/whatsapp/create-instance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instance_name: instanceName.trim(),
          phone: phone.replace(/\D/g, ""),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Erro ao criar instância");
      }

      if (json.data?.pair_code) {
        setPairCode(json.data.pair_code);
        setStatus("connecting");
        startPolling();
      } else {
        setError("Código não recebido. Tente novamente.");
        setConnecting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao conectar");
      setConnecting(false);
    }
  }

  // Diagnostics: fetch webhook debug info
  async function handleDiagnostics() {
    setDiagLoading(true);
    setDiagData(null);
    try {
      const res = await fetch("/api/webhooks/whatsapp");
      const json = await res.json();
      setDiagData(json);
    } catch {
      setDiagData({ error: "Falha ao buscar diagnóstico" });
    } finally {
      setDiagLoading(false);
    }
  }

  // Check what URL is registered in uazapi
  async function handleWebhookInfo() {
    setWebhookInfoLoading(true);
    setWebhookInfo(null);
    try {
      const res = await fetch("/api/whatsapp/webhook-info");
      const json = await res.json();
      setWebhookInfo(json);
    } catch {
      setWebhookInfo({ error: "Falha ao consultar uazapi" });
    } finally {
      setWebhookInfoLoading(false);
    }
  }

  // Reconfigure webhook
  async function handleReconfigureWebhook() {
    if (!instanceName) return;
    setWebhookStatus("loading");
    setWebhookMsg(null);
    try {
      const res = await fetch("/api/whatsapp/configure-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instance_id: instanceName }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setWebhookStatus("error");
        setWebhookMsg(json.error || "Falha ao configurar webhook");
      } else {
        setWebhookStatus("ok");
        setWebhookMsg(`Webhook configurado: ${json.data?.webhook_url}`);
      }
    } catch {
      setWebhookStatus("error");
      setWebhookMsg("Erro ao conectar com o servidor");
    }
  }

  // Disconnect
  async function handleDisconnect() {
    if (!tenantId) return;
    setLoading(true);
    try {
      await fetch("/api/whatsapp/disconnect", { method: "POST" });
      await supabase
        .from("whatsapp_sessions")
        .update({ status: "disconnected", updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId);
      setStatus("disconnected");
      setPhoneNumber(null);
      setPairCode(null);
      setLogs([]);
    } catch {
      setError("Erro ao desconectar");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-headline text-foreground">Conexão WhatsApp</h1>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-bold">×</button>
        </div>
      )}

      {status !== "connected" ? (
        <div className="flex items-center justify-center py-8">
          <div className="rounded-card bg-surface-container-lowest p-8 shadow-card max-w-md w-full space-y-6">

            {pairCode ? (
              /* Show pairing code */
              <div className="space-y-5 text-center">
                <div className="flex justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <MessageCircle className="h-8 w-8 text-emerald-600" />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Código de pareamento:</p>
                  <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 px-6 py-4">
                    <p className="text-3xl font-bold tracking-[0.3em] text-emerald-700">{pairCode}</p>
                  </div>
                </div>

                <div className="space-y-2 text-left rounded-lg bg-muted/30 p-4">
                  <p className="text-sm font-medium text-foreground">Como conectar:</p>
                  <ol className="space-y-1.5 text-sm text-muted-foreground">
                    <li>1. Abra o <strong>WhatsApp</strong> no celular</li>
                    <li>2. Vá em <strong>Configurações → Dispositivos conectados</strong></li>
                    <li>3. Toque em <strong>Conectar dispositivo</strong></li>
                    <li>4. Toque em <strong>Conectar com número de telefone</strong></li>
                    <li>5. Digite o código acima</li>
                  </ol>
                </div>

                {connecting && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Aguardando conexão...
                  </div>
                )}

                <button
                  onClick={() => { setPairCode(null); setConnecting(false); if (pollingRef.current) clearInterval(pollingRef.current); }}
                  className="text-sm text-muted-foreground hover:text-foreground transition"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              /* Form to create instance */
              <div className="space-y-5">
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
                    <Wifi className="h-8 w-8 text-amber-600" />
                  </div>
                  <h3 className="font-semibold text-foreground">Conecte seu WhatsApp</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Um código será enviado para você conectar
                  </p>
                </div>

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

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Número do WhatsApp (com DDD)
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(maskPhone(e.target.value))}
                    placeholder="+55 (11) 99999-0000"
                    className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none transition-colors focus:border-amber-400"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    O número que seus clientes usarão para contato
                  </p>
                </div>

                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {connecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MessageCircle className="h-4 w-4" />
                  )}
                  Gerar código de conexão
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Connected State */
        <div className="space-y-6">
          <div className="rounded-card bg-surface-container-lowest p-6 shadow-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <span className="font-bold text-foreground">Conectado</span>
                  <p className="text-sm text-muted-foreground">WhatsApp Business ativo</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleDiagnostics}
                  disabled={diagLoading}
                  title="Ver diagnóstico do webhook"
                  className="flex items-center gap-2 rounded-lg border-2 border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 transition disabled:opacity-50"
                >
                  {diagLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bug className="h-4 w-4" />}
                  Diagnóstico
                </button>
                <button
                  onClick={handleWebhookInfo}
                  disabled={webhookInfoLoading}
                  title="Ver URL registrada no uazapi"
                  className="flex items-center gap-2 rounded-lg border-2 border-purple-200 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50 transition disabled:opacity-50"
                >
                  {webhookInfoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Webhook className="h-4 w-4" />}
                  URL Registrada
                </button>
                <button
                  onClick={handleReconfigureWebhook}
                  disabled={webhookStatus === "loading"}
                  title="Reconfigurar webhook do bot"
                  className="flex items-center gap-2 rounded-lg border-2 border-amber-200 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 transition disabled:opacity-50"
                >
                  {webhookStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Webhook className="h-4 w-4" />}
                  Reconfigurar Webhook
                </button>
                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-2 rounded-lg border-2 border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition"
                >
                  <WifiOff className="h-4 w-4" />
                  Desconectar
                </button>
              </div>
            </div>
            {webhookMsg && (
              <div className={`mt-3 rounded-lg px-4 py-2 text-sm ${webhookStatus === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {webhookMsg}
              </div>
            )}
            {diagData && (
              <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-4 text-xs font-mono overflow-auto max-h-64">
                <p className="font-semibold text-slate-700 mb-2 font-sans">Diagnóstico do Webhook:</p>
                <pre className="text-slate-600 whitespace-pre-wrap break-all">{JSON.stringify(diagData, null, 2)}</pre>
              </div>
            )}
            {webhookInfo && (
              <div className="mt-3 rounded-lg bg-purple-50 border border-purple-200 p-4 text-xs font-mono overflow-auto max-h-64">
                <p className="font-semibold text-purple-700 mb-2 font-sans">URL Registrada no uazapi:</p>
                <pre className="text-purple-800 whitespace-pre-wrap break-all">{JSON.stringify(webhookInfo, null, 2)}</pre>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-card bg-surface-container-lowest p-4 shadow-card space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Smartphone className="h-4 w-4" />
                Número
              </div>
              <p className="font-semibold text-foreground">{phoneNumber || "—"}</p>
            </div>
            <div className="rounded-card bg-surface-container-lowest p-4 shadow-card space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Smartphone className="h-4 w-4" />
                Instância
              </div>
              <p className="font-semibold text-foreground">{instanceName || "—"}</p>
            </div>
            <div className="rounded-card bg-surface-container-lowest p-4 shadow-card space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Status
              </div>
              <p className="font-semibold text-green-600">Online</p>
            </div>
          </div>

          <div className="rounded-card bg-surface-container-lowest shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Últimas mensagens</h3>
              <button onClick={fetchLogs} className="text-sm text-muted-foreground hover:text-foreground transition flex items-center gap-1">
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar
              </button>
            </div>
            {logs.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                Nenhuma mensagem registrada ainda.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Horário</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Direção</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Mensagem</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("pt-BR", {
                          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        {log.direction === "in" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700">
                            <ArrowDownLeft className="h-3 w-3" /> Entrada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-700">
                            <ArrowUpRight className="h-3 w-3" /> Saída
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-foreground max-w-md truncate">{log.content}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
