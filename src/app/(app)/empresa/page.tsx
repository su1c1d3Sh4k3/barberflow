"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Building2,
  Upload,
  Plus,
  MapPin,
  Clock,
  CalendarDays,
  Save,
  X,
  Loader2,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { maskCep, maskCnpj, fetchCep, ESTADOS_BR } from "@/lib/masks";
import { useTenantStore } from "@/stores/tenant-store";
import { createClient } from "@/lib/supabase/client";
import { ImageUpload } from "@/components/ui/image-upload";

/* ─── Types ─── */
type Tab = "dados" | "unidades" | "horarios" | "marca";

interface DaySchedule {
  name: string;
  enabled: boolean;
  open: string;
  close: string;
}

interface FormData {
  nomeFantasia: string;
  razaoSocial: string;
  cnpj: string;
  descricao: string;
  cep: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
}

const DAY_NAMES = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

const emptyForm: FormData = {
  nomeFantasia: "",
  razaoSocial: "",
  cnpj: "",
  descricao: "",
  cep: "",
  rua: "",
  numero: "",
  bairro: "",
  cidade: "",
  estado: "",
};

const defaultSchedule: DaySchedule[] = DAY_NAMES.map((name, i) => ({
  name,
  enabled: i < 6,
  open: i < 5 ? "09:00" : "08:00",
  close: i < 5 ? "20:00" : "18:00",
}));

/* ─── Component ─── */
export default function EmpresaPage() {
  const { tenant } = useTenantStore();
  const tenantId = tenant?.id;

  const [activeTab, setActiveTab] = useState<Tab>("dados");
  const [form, setForm] = useState<FormData>(emptyForm);
  const [schedule, setSchedule] = useState<DaySchedule[]>(defaultSchedule);
  const [changeCount, setChangeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [fetchingCep, setFetchingCep] = useState(false);

  // Units (Unidades) state
  const [units, setUnits] = useState<{ id: string; name: string; address: Record<string, string> | null }[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [showNewUnit, setShowNewUnit] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitAddress, setNewUnitAddress] = useState("");
  const [creatingUnit, setCreatingUnit] = useState(false);

  // Holidays state
  const [holidays, setHolidays] = useState<{ id: string; date: string; name: string }[]>([]);
  const [showHolidays, setShowHolidays] = useState(false);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");

  // Logo state
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Brand (Marca) state
  const [primaryColor, setPrimaryColor] = useState("#F59E0B");
  const [secondaryColor, setSecondaryColor] = useState("#1F2937");

  // Keep a ref of "saved" state to compute dirty changes
  const savedFormRef = useRef<FormData>(emptyForm);
  const savedScheduleRef = useRef<DaySchedule[]>(defaultSchedule);

  const supabase = createClient();

  const tabs: { key: Tab; label: string }[] = [
    { key: "dados", label: "Dados gerais" },
    { key: "unidades", label: "Unidades" },
    { key: "horarios", label: "Horários" },
    { key: "marca", label: "Marca" },
  ];

  /* ─── Fetch Data ─── */
  useEffect(() => {
    if (!tenantId) return;

    async function fetchData() {
      setLoading(true);
      try {
        // Fetch default company
        const { data: companyData } = await supabase
          .from("companies")
          .select("*")
          .eq("tenant_id", tenantId!)
          .eq("is_default", true)
          .single();

        if (companyData) {
          setCompanyId(companyData.id);
          const formData: FormData = {
            nomeFantasia: companyData.name || "",
            razaoSocial: companyData.razao_social || "",
            cnpj: companyData.cnpj || "",
            descricao: companyData.description || "",
            cep: companyData.address?.cep || "",
            rua: companyData.address?.rua || "",
            numero: companyData.address?.numero || "",
            bairro: companyData.address?.bairro || "",
            cidade: companyData.address?.cidade || "",
            estado: companyData.address?.estado || "",
          };
          setForm(formData);
          savedFormRef.current = formData;
          setLogoUrl(companyData.logo_url || null);

          // Fetch business hours
          const { data: hoursData } = await supabase
            .from("business_hours")
            .select("*")
            .eq("company_id", companyData.id)
            .order("weekday");

          if (hoursData && hoursData.length > 0) {
            const scheduleData: DaySchedule[] = DAY_NAMES.map((name, i) => {
              const found = hoursData.find((h: Record<string, unknown>) => h.weekday === i);
              if (found) {
                return {
                  name,
                  enabled: !found.closed,
                  open: found.open_time || "09:00",
                  close: found.close_time || "18:00",
                };
              }
              return { name, enabled: false, open: "00:00", close: "00:00" };
            });
            setSchedule(scheduleData);
            savedScheduleRef.current = scheduleData;
          }
        }
      } catch (err) {
        console.error("Erro ao carregar dados da empresa:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  /* ─── Fetch Units ─── */
  const fetchUnits = useCallback(async () => {
    if (!tenantId) return;
    setLoadingUnits(true);
    const { data } = await supabase
      .from("companies")
      .select("id, name, address")
      .eq("tenant_id", tenantId)
      .order("is_default", { ascending: false });
    setUnits(data || []);
    setLoadingUnits(false);
  }, [tenantId]);

  useEffect(() => {
    if (activeTab === "unidades") {
      fetchUnits();
    }
  }, [activeTab, fetchUnits]);

  const handleCreateUnit = async () => {
    if (!tenantId || !newUnitName.trim()) return;
    setCreatingUnit(true);
    await supabase.from("companies").insert({
      tenant_id: tenantId,
      name: newUnitName.trim(),
      address: newUnitAddress.trim() ? { rua: newUnitAddress.trim() } : null,
      is_default: false,
    });
    setCreatingUnit(false);
    setShowNewUnit(false);
    setNewUnitName("");
    setNewUnitAddress("");
    await fetchUnits();
  };

  /* ─── Helpers ─── */
  function updateForm(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setChangeCount((c) => c + 1);
  }

  async function handleCepChange(raw: string) {
    const masked = maskCep(raw);
    updateForm("cep", masked);
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 8) {
      setFetchingCep(true);
      const addr = await fetchCep(digits);
      if (addr) {
        setForm((prev) => ({
          ...prev,
          rua: addr.rua,
          bairro: addr.bairro,
          cidade: addr.cidade,
          estado: addr.estado,
        }));
        setChangeCount((c) => c + 4);
      }
      setFetchingCep(false);
    }
  }

  function toggleDay(index: number) {
    setSchedule((prev) =>
      prev.map((d, i) => (i === index ? { ...d, enabled: !d.enabled } : d))
    );
    setChangeCount((c) => c + 1);
  }

  function updateTime(index: number, field: "open" | "close", value: string) {
    setSchedule((prev) =>
      prev.map((d, i) => (i === index ? { ...d, [field]: value } : d))
    );
    setChangeCount((c) => c + 1);
  }

  function discard() {
    setForm(savedFormRef.current);
    setSchedule(savedScheduleRef.current);
    setChangeCount(0);
  }

  async function handleSave() {
    if (!tenantId) return;
    setSaving(true);
    setAlert(null);

    try {
      const companyPayload = {
        name: form.nomeFantasia,
        razao_social: form.razaoSocial,
        cnpj: form.cnpj,
        description: form.descricao,
        logo_url: logoUrl || null,
        address: {
          cep: form.cep,
          rua: form.rua,
          numero: form.numero,
          bairro: form.bairro,
          cidade: form.cidade,
          estado: form.estado,
        },
      };

      let currentCompanyId = companyId;

      if (currentCompanyId) {
        // Update existing company
        const { error } = await supabase
          .from("companies")
          .update(companyPayload)
          .eq("id", currentCompanyId);
        if (error) throw error;
      } else {
        // Create new company
        const { data: newCompany, error } = await supabase
          .from("companies")
          .insert({ ...companyPayload, tenant_id: tenantId, is_default: true })
          .select()
          .single();
        if (error) throw error;
        currentCompanyId = newCompany.id;
        setCompanyId(newCompany.id);
      }

      // Upsert business hours: delete then insert
      const { error: delError } = await supabase
        .from("business_hours")
        .delete()
        .eq("company_id", currentCompanyId);
      if (delError) throw delError;

      const hoursToInsert = schedule
        .map((day, index) => ({
          company_id: currentCompanyId!,
          tenant_id: tenantId,
          weekday: index,
          open_time: day.open,
          close_time: day.close,
          closed: !day.enabled,
        }))
        .filter((h) => !h.closed);

      if (hoursToInsert.length > 0) {
        const { error } = await supabase
          .from("business_hours")
          .insert(hoursToInsert);
        if (error) throw error;
      }

      // Update saved refs
      savedFormRef.current = { ...form };
      savedScheduleRef.current = [...schedule];
      setChangeCount(0);
      setAlert({ type: "success", message: "Alterações salvas com sucesso!" });
      setTimeout(() => setAlert(null), 3000);
    } catch (err: unknown) {
      console.error("Erro ao salvar:", err);
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: string }).message)
            : "Erro ao salvar alterações. Tente novamente.";
      setAlert({ type: "error", message: msg });
      setTimeout(() => setAlert(null), 5000);
    } finally {
      setSaving(false);
    }
  }

  /* ─── Loading Skeleton ─── */
  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <div className="h-5 w-28 animate-pulse rounded bg-surface-container-low" />
            <div className="mt-2 h-8 w-64 animate-pulse rounded bg-surface-container-low" />
          </div>
          <div className="h-10 w-36 animate-pulse rounded-full bg-surface-container-low" />
        </div>
        {/* Tabs skeleton */}
        <div className="flex gap-6 border-b border-surface-container">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-6 w-20 animate-pulse rounded bg-surface-container-low mb-3" />
          ))}
        </div>
        {/* Content skeleton */}
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8 space-y-6">
            <div className="h-[300px] animate-pulse rounded-card bg-surface-container-low" />
            <div className="h-[400px] animate-pulse rounded-card bg-surface-container-low" />
          </div>
          <div className="col-span-12 lg:col-span-4">
            <div className="h-[350px] animate-pulse rounded-card bg-surface-container-low" />
          </div>
        </div>
      </div>
    );
  }

  /* ─── Render ─── */
  return (
    <div className="space-y-6">
      {/* Alert */}
      {alert && (
        <div
          className={cn(
            "flex items-center gap-3 rounded-card px-4 py-3 text-sm font-medium",
            alert.type === "success"
              ? "bg-green-500/10 text-green-600"
              : "bg-red-500/10 text-red-600"
          )}
        >
          {alert.message}
          <button onClick={() => setAlert(null)} className="ml-auto">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="inline-block rounded-pill bg-[#F59E0B]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-[#F59E0B]">
            Gerenciamento
          </span>
          <h1 className="mt-2 text-headline text-foreground">
            Configurações da Empresa
          </h1>
        </div>
        <button className="flex items-center gap-2 rounded-pill bg-[#F59E0B] px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-[#D97706]">
          <Plus size={16} />
          Nova unidade
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-surface-container">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "relative pb-3 text-sm font-medium transition",
              activeTab === tab.key
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-[#F59E0B]" />
            )}
          </button>
        ))}
      </div>

      {/* ─── Tab: Dados gerais ─── */}
      {activeTab === "dados" && (
      <div className="grid grid-cols-12 gap-6">
        {/* LEFT COLUMN */}
        <div className="col-span-12 space-y-6 lg:col-span-8">
          {/* Informações Principais */}
          <div className="rounded-card bg-surface-container-lowest p-6 shadow-card">
            <h2 className="mb-5 flex items-center gap-2 text-title text-foreground">
              <Building2 size={18} className="text-[#F59E0B]" />
              Informações Principais
            </h2>

            <div className="flex flex-col gap-6 sm:flex-row">
              {/* Logo Upload */}
              <ImageUpload
                currentUrl={logoUrl}
                category="logos"
                onUpload={(url) => {
                  setLogoUrl(url || null);
                  setChangeCount((c) => c + 1);
                }}
                shape="circle"
                size={120}
                label="Logo"
              />

              {/* Fields */}
              <div className="flex-1 grid grid-cols-12 gap-4">
                {/* Nome fantasia */}
                <div className="col-span-12 sm:col-span-6">
                  <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                    Nome fantasia
                  </label>
                  <input
                    type="text"
                    value={form.nomeFantasia}
                    onChange={(e) => updateForm("nomeFantasia", e.target.value)}
                    className="w-full rounded-input bg-surface-container-low border-none px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                  />
                </div>

                {/* Razão social */}
                <div className="col-span-12 sm:col-span-6">
                  <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                    Razão social
                  </label>
                  <input
                    type="text"
                    value={form.razaoSocial}
                    onChange={(e) => updateForm("razaoSocial", e.target.value)}
                    className="w-full rounded-input bg-surface-container-low border-none px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                  />
                </div>

                {/* CNPJ */}
                <div className="col-span-12 sm:col-span-6">
                  <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                    CNPJ
                  </label>
                  <input
                    type="text"
                    value={form.cnpj}
                    onChange={(e) => updateForm("cnpj", maskCnpj(e.target.value))}
                    placeholder="00.000.000/0001-00"
                    maxLength={18}
                    className="w-full rounded-input bg-surface-container-low border-none px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                  />
                </div>

                {/* Spacer on right */}
                <div className="col-span-6 hidden sm:block" />

                {/* Descrição */}
                <div className="col-span-12">
                  <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                    Descrição
                  </label>
                  <textarea
                    rows={3}
                    value={form.descricao}
                    onChange={(e) => updateForm("descricao", e.target.value)}
                    className="w-full resize-none rounded-input bg-surface-container-low border-none px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div className="rounded-card bg-surface-container-lowest p-6 shadow-card">
            <h2 className="mb-5 flex items-center gap-2 text-title text-foreground">
              <MapPin size={18} className="text-[#F59E0B]" />
              Endereço
            </h2>

            <div className="grid grid-cols-12 gap-4">
              {/* CEP */}
              <div className="col-span-12 sm:col-span-4">
                <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  CEP
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.cep}
                    onChange={(e) => handleCepChange(e.target.value)}
                    placeholder="00000-000"
                    maxLength={9}
                    className="w-full rounded-input bg-surface-container-low border-none px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                  />
                  {fetchingCep && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Rua */}
              <div className="col-span-12 sm:col-span-8">
                <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  Rua
                </label>
                <input
                  type="text"
                  value={form.rua}
                  onChange={(e) => updateForm("rua", e.target.value)}
                  className="w-full rounded-input bg-surface-container-low border-none px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                />
              </div>

              {/* Número */}
              <div className="col-span-4 sm:col-span-3">
                <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  Número
                </label>
                <input
                  type="text"
                  value={form.numero}
                  onChange={(e) => updateForm("numero", e.target.value)}
                  className="w-full rounded-input bg-surface-container-low border-none px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                />
              </div>

              {/* Bairro */}
              <div className="col-span-8 sm:col-span-4">
                <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  Bairro
                </label>
                <input
                  type="text"
                  value={form.bairro}
                  onChange={(e) => updateForm("bairro", e.target.value)}
                  className="w-full rounded-input bg-surface-container-low border-none px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                />
              </div>

              {/* Cidade */}
              <div className="col-span-12 sm:col-span-5">
                <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  Cidade
                </label>
                <input
                  type="text"
                  value={form.cidade}
                  onChange={(e) => updateForm("cidade", e.target.value)}
                  className="w-full rounded-input bg-surface-container-low border-none px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                />
              </div>

              {/* Estado */}
              <div className="col-span-12 sm:col-span-4">
                <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  Estado
                </label>
                <select
                  value={form.estado}
                  onChange={(e) => updateForm("estado", e.target.value)}
                  className="w-full rounded-input bg-surface-container-low border-none px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                >
                  <option value="">Selecione...</option>
                  {ESTADOS_BR.map((e) => (
                    <option key={e.uf} value={e.uf}>
                      {e.uf} - {e.nome}
                    </option>
                  ))}
                </select>
              </div>

              {/* Map Placeholder */}
              <div className="col-span-12">
                <div className="flex h-[240px] items-center justify-center rounded-xl bg-surface-container-low">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <MapPin size={32} />
                    <span className="text-sm">Mapa será exibido aqui</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — Save Card */}
        <div className="col-span-12 space-y-6 lg:col-span-4">
          {/* Save Card - Sticky */}
          {changeCount > 0 && (
            <div className="sticky bottom-8 rounded-card border border-surface-container bg-surface-container-lowest/80 p-5 shadow-float backdrop-blur-md">
              <p className="mb-3 text-sm text-muted-foreground">
                Você possui{" "}
                <span className="font-semibold text-foreground">
                  {changeCount} alterações
                </span>{" "}
                não salvas
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-pill bg-[#F59E0B] px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-[#D97706] disabled:opacity-60"
                >
                  <Save size={14} />
                  {saving ? "Salvando..." : "Salvar alterações"}
                </button>
                <button
                  onClick={discard}
                  className="flex items-center gap-2 rounded-pill px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-surface-container-low hover:text-foreground"
                >
                  <X size={14} />
                  Descartar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* ─── Tab: Unidades ─── */}
      {activeTab === "unidades" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-title text-foreground">
              <Building2 size={18} className="text-[#F59E0B]" />
              Unidades
            </h2>
            <button
              onClick={() => setShowNewUnit(true)}
              className="flex items-center gap-2 rounded-pill bg-[#F59E0B] px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-[#D97706]"
            >
              <Plus size={16} />
              Nova unidade
            </button>
          </div>

          {loadingUnits ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : units.length === 0 ? (
            <div className="rounded-card bg-surface-container-lowest p-10 text-center shadow-card">
              <p className="text-muted-foreground">Nenhuma unidade cadastrada</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-card bg-surface-container-lowest shadow-card">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-container-low/50">
                    <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Endereço
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {units.map((unit) => (
                    <tr key={unit.id} className="transition-colors hover:bg-surface-container-low/40">
                      <td className="px-6 py-4 text-sm font-medium text-foreground">{unit.name}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {unit.address
                          ? [unit.address.rua, unit.address.numero, unit.address.bairro, unit.address.cidade]
                              .filter(Boolean)
                              .join(", ") || "—"
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* New Unit Modal */}
          {showNewUnit && (
            <>
              <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setShowNewUnit(false)} />
              <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface-container-lowest p-6 shadow-xl">
                <h2 className="text-lg font-bold text-foreground">Nova unidade</h2>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Nome</label>
                    <input
                      type="text"
                      value={newUnitName}
                      onChange={(e) => setNewUnitName(e.target.value)}
                      placeholder="Nome da unidade"
                      className="w-full rounded-input bg-surface-container-low border-none px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Endereço</label>
                    <input
                      type="text"
                      value={newUnitAddress}
                      onChange={(e) => setNewUnitAddress(e.target.value)}
                      placeholder="Rua, número, bairro"
                      className="w-full rounded-input bg-surface-container-low border-none px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => setShowNewUnit(false)}
                    className="rounded-pill px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-surface-container-low"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateUnit}
                    disabled={creatingUnit || !newUnitName.trim()}
                    className="flex items-center gap-2 rounded-pill bg-[#F59E0B] px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-[#D97706] disabled:opacity-60"
                  >
                    {creatingUnit && <Loader2 className="h-4 w-4 animate-spin" />}
                    Criar unidade
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Tab: Horários ─── */}
      {activeTab === "horarios" && (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-6">
            <div className="rounded-card bg-surface-container-lowest p-6 shadow-card">
              <h2 className="mb-5 flex items-center gap-2 text-title text-foreground">
                <Clock size={18} className="text-[#F59E0B]" />
                Horários
              </h2>

              <div className="space-y-3">
                {schedule.map((day, index) => (
                  <div
                    key={day.name}
                    className={cn(
                      "flex items-center gap-3",
                      !day.enabled && "opacity-60"
                    )}
                  >
                    <span className="w-[72px] text-sm font-medium text-foreground">
                      {day.name}
                    </span>

                    <button
                      onClick={() => toggleDay(index)}
                      className={cn(
                        "relative h-5 w-10 flex-shrink-0 rounded-full transition-colors",
                        day.enabled ? "bg-[#F59E0B]" : "bg-surface-container-high"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                          day.enabled ? "left-[22px]" : "left-0.5"
                        )}
                      />
                    </button>

                    {day.enabled ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="time"
                          value={day.open}
                          onChange={(e) => updateTime(index, "open", e.target.value)}
                          className="w-[90px] rounded-input bg-surface-container-low border-none px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                        />
                        <span className="text-xs text-muted-foreground">–</span>
                        <input
                          type="time"
                          value={day.close}
                          onChange={(e) => updateTime(index, "close", e.target.value)}
                          className="w-[90px] rounded-input bg-surface-container-low border-none px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                        />
                      </div>
                    ) : (
                      <span className="text-xs italic text-muted-foreground">
                        Estabelecimento fechado
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={async () => {
                  setShowHolidays(!showHolidays);
                  if (!showHolidays && companyId) {
                    const { data } = await supabase
                      .from("holidays")
                      .select("id, date, name")
                      .eq("company_id", companyId)
                      .order("date");
                    setHolidays(data || []);
                  }
                }}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-btn border border-surface-container-high px-4 py-2.5 text-xs font-medium text-foreground transition hover:bg-surface-container-low"
              >
                <CalendarDays size={14} />
                {showHolidays ? "Ocultar feriados" : "Configurar exceções e feriados"}
              </button>

              {showHolidays && (
                <div className="mt-4 space-y-3">
                  {holidays.map((h) => (
                    <div key={h.id} className="flex items-center justify-between rounded-xl border border-surface-container-high px-4 py-2">
                      <div>
                        <span className="text-sm font-medium">{h.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{h.date}</span>
                      </div>
                      <button
                        onClick={async () => {
                          await supabase.from("holidays").delete().eq("id", h.id);
                          setHolidays((prev) => prev.filter((x) => x.id !== h.id));
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={newHolidayDate}
                      onChange={(e) => setNewHolidayDate(e.target.value)}
                      className="flex-1 rounded-input border border-surface-container-high bg-surface-container-lowest px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Nome do feriado"
                      value={newHolidayName}
                      onChange={(e) => setNewHolidayName(e.target.value)}
                      className="flex-1 rounded-input border border-surface-container-high bg-surface-container-lowest px-3 py-2 text-sm"
                    />
                    <button
                      onClick={async () => {
                        if (!newHolidayDate || !newHolidayName || !companyId) return;
                        const { data } = await supabase
                          .from("holidays")
                          .insert({ company_id: companyId, date: newHolidayDate, name: newHolidayName })
                          .select()
                          .single();
                        if (data) {
                          setHolidays((prev) => [...prev, data]);
                          setNewHolidayDate("");
                          setNewHolidayName("");
                        }
                      }}
                      className="rounded-btn bg-[#F59E0B] px-4 py-2 text-sm font-medium text-white hover:bg-[#D97706]"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="col-span-12 lg:col-span-6">
            {changeCount > 0 && (
              <div className="sticky bottom-8 rounded-card border border-surface-container bg-surface-container-lowest/80 p-5 shadow-float backdrop-blur-md">
                <p className="mb-3 text-sm text-muted-foreground">
                  Você possui{" "}
                  <span className="font-semibold text-foreground">
                    {changeCount} alterações
                  </span>{" "}
                  não salvas
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-pill bg-[#F59E0B] px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-[#D97706] disabled:opacity-60"
                  >
                    <Save size={14} />
                    {saving ? "Salvando..." : "Salvar alterações"}
                  </button>
                  <button
                    onClick={discard}
                    className="flex items-center gap-2 rounded-pill px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-surface-container-low hover:text-foreground"
                  >
                    <X size={14} />
                    Descartar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Tab: Marca ─── */}
      {activeTab === "marca" && (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-6 space-y-6">
            {/* Logo Upload */}
            <div className="rounded-card bg-surface-container-lowest p-6 shadow-card">
              <h2 className="mb-5 flex items-center gap-2 text-title text-foreground">
                <Upload size={18} className="text-[#F59E0B]" />
                Logo
              </h2>
              <div className="flex flex-col items-center gap-4 p-6">
                <ImageUpload
                  currentUrl={logoUrl}
                  category="logos"
                  onUpload={(url) => {
                    setLogoUrl(url || null);
                    setChangeCount((c) => c + 1);
                  }}
                  shape="square"
                  size={160}
                />
                <p className="text-xs text-muted-foreground">
                  PNG, JPG ou SVG. Tamanho máximo: 2MB
                </p>
              </div>
            </div>

            {/* Brand Colors */}
            <div className="rounded-card bg-surface-container-lowest p-6 shadow-card">
              <h2 className="mb-5 flex items-center gap-2 text-title text-foreground">
                <Palette size={18} className="text-[#F59E0B]" />
                Cores da marca
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                    Cor primária
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-10 w-10 cursor-pointer rounded-lg border-none"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-full rounded-input bg-surface-container-low border-none px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                    Cor secundária
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="h-10 w-10 cursor-pointer rounded-lg border-none"
                    />
                    <input
                      type="text"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="w-full rounded-input bg-surface-container-low border-none px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
