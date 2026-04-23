"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Building2,
  Plus,
  MapPin,
  Clock,
  CalendarDays,
  Save,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Users,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { maskCep, maskCnpj, fetchCep, ESTADOS_BR } from "@/lib/masks";
import { useTenantStore } from "@/stores/tenant-store";
import { createClient } from "@/lib/supabase/client";
import { ImageUpload } from "@/components/ui/image-upload";

/* ─── Types ─── */
type Tab = "dados" | "unidades";

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
}

interface Unit {
  id: string;
  name: string;
  is_default: boolean;
  address: Record<string, string | number> | null;
}

interface Professional {
  id: string;
  name: string;
  company_id: string | null;
}

interface AddressForm {
  cep: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  lat: number | null;
  lng: number | null;
}

const DAY_NAMES = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

const emptyAddress: AddressForm = {
  cep: "", rua: "", numero: "", bairro: "", cidade: "", estado: "", lat: null, lng: null,
};

const defaultSchedule: DaySchedule[] = DAY_NAMES.map((name, i) => ({
  name,
  enabled: i < 6,
  open: i < 5 ? "09:00" : "08:00",
  close: i < 5 ? "20:00" : "18:00",
}));

/* ─── Geocodificação via Nominatim ─── */
async function geocodeAddress(rua: string, numero: string, cidade: string, estado: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const query = [rua, numero, cidade, estado, "Brasil"].filter(Boolean).join(", ");
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { "User-Agent": "BarberFlow/1.0" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

function googleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function MapPreview({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div className="relative overflow-hidden rounded-xl">
      <iframe
        className="h-[220px] w-full rounded-xl border-0"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.005},${lat - 0.005},${lng + 0.005},${lat + 0.005}&layer=mapnik&marker=${lat},${lng}`}
        title="Mapa"
      />
      <a
        href={googleMapsUrl(lat, lng)}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute right-2 top-2 flex items-center gap-1.5 rounded-pill bg-white/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-md backdrop-blur-sm hover:bg-white"
      >
        <ExternalLink size={12} />
        Abrir no Google Maps
      </a>
    </div>
  );
}

/* ─── Painel de Endereço da Unidade ─── */
function AddressCard({
  unitId,
  initialAddress,
  onSaved,
}: {
  unitId: string;
  initialAddress: AddressForm;
  onSaved: (addr: AddressForm) => void;
}) {
  const supabase = createClient();
  const [addr, setAddr] = useState<AddressForm>(initialAddress);
  const [fetchingCep, setFetchingCep] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function update(field: keyof AddressForm, value: string | number | null) {
    setAddr((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCep(raw: string) {
    const masked = maskCep(raw);
    update("cep", masked);
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 8) {
      setFetchingCep(true);
      const result = await fetchCep(digits);
      if (result) {
        setAddr((prev) => ({
          ...prev,
          cep: masked,
          rua: result.rua,
          bairro: result.bairro,
          cidade: result.cidade,
          estado: result.estado,
          lat: null,
          lng: null,
        }));
      }
      setFetchingCep(false);
    }
  }

  async function handleGeocode() {
    setGeocoding(true);
    const coords = await geocodeAddress(addr.rua, addr.numero, addr.cidade, addr.estado);
    if (coords) setAddr((prev) => ({ ...prev, lat: coords.lat, lng: coords.lng }));
    setGeocoding(false);
  }

  async function handleSave() {
    setSaving(true);
    await supabase.from("companies").update({ address: addr }).eq("id", unitId);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved(addr);
  }

  return (
    <div className="rounded-card bg-surface-container-lowest p-5 shadow-card">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <MapPin size={15} className="text-[#F59E0B]" />
        Endereço
      </h3>

      <div className="grid grid-cols-12 gap-3">
        {/* CEP */}
        <div className="col-span-12 sm:col-span-4">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">CEP</label>
          <div className="relative">
            <input
              type="text"
              value={addr.cep}
              onChange={(e) => handleCep(e.target.value)}
              placeholder="00000-000"
              maxLength={9}
              className="w-full rounded-input bg-surface-container-low border-none px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
            />
            {fetchingCep && <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
        </div>

        {/* Rua */}
        <div className="col-span-12 sm:col-span-8">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Rua</label>
          <input
            type="text"
            value={addr.rua}
            onChange={(e) => update("rua", e.target.value)}
            className="w-full rounded-input bg-surface-container-low border-none px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
          />
        </div>

        {/* Número */}
        <div className="col-span-4 sm:col-span-3">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Número</label>
          <input
            type="text"
            value={addr.numero}
            onChange={(e) => update("numero", e.target.value)}
            className="w-full rounded-input bg-surface-container-low border-none px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
          />
        </div>

        {/* Bairro */}
        <div className="col-span-8 sm:col-span-4">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Bairro</label>
          <input
            type="text"
            value={addr.bairro}
            onChange={(e) => update("bairro", e.target.value)}
            className="w-full rounded-input bg-surface-container-low border-none px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
          />
        </div>

        {/* Cidade */}
        <div className="col-span-12 sm:col-span-5">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Cidade</label>
          <input
            type="text"
            value={addr.cidade}
            onChange={(e) => update("cidade", e.target.value)}
            className="w-full rounded-input bg-surface-container-low border-none px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
          />
        </div>

        {/* Estado */}
        <div className="col-span-12 sm:col-span-4">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Estado</label>
          <select
            value={addr.estado}
            onChange={(e) => update("estado", e.target.value)}
            className="w-full rounded-input bg-surface-container-low border-none px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40"
          >
            <option value="">Selecione...</option>
            {ESTADOS_BR.map((e) => (
              <option key={e.uf} value={e.uf}>{e.uf} - {e.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Mapa */}
      <div className="mt-4">
        {addr.lat && addr.lng ? (
          <MapPreview lat={addr.lat} lng={addr.lng} />
        ) : (
          <button
            onClick={handleGeocode}
            disabled={geocoding || !addr.rua || !addr.cidade}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-surface-container-high py-5 text-sm text-muted-foreground transition hover:border-[#F59E0B]/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {geocoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin size={16} />}
            {geocoding ? "Buscando localização..." : "Exibir localização no mapa"}
          </button>
        )}
        {addr.lat && addr.lng && (
          <button
            onClick={handleGeocode}
            disabled={geocoding}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Recalcular posição
          </button>
        )}
      </div>

      {/* Salvar */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-pill bg-[#F59E0B] px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-[#D97706] disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? "Salvo!" : saving ? "Salvando..." : "Salvar endereço"}
        </button>
      </div>
    </div>
  );
}

/* ─── Card de Horários da Unidade ─── */
function ScheduleCard({ unitId, tenantId }: { unitId: string; tenantId: string }) {
  const supabase = createClient();
  const [schedule, setSchedule] = useState<DaySchedule[]>(defaultSchedule);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showHolidays, setShowHolidays] = useState(false);
  const [holidays, setHolidays] = useState<{ id: string; date: string; name: string }[]>([]);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("business_hours")
        .select("*")
        .eq("company_id", unitId)
        .order("weekday");

      if (data && data.length > 0) {
        setSchedule(DAY_NAMES.map((name, i) => {
          const found = data.find((h: Record<string, unknown>) => h.weekday === i);
          if (found) return { name, enabled: !found.closed, open: found.open_time || "09:00", close: found.close_time || "18:00" };
          return { name, enabled: false, open: "09:00", close: "18:00" };
        }));
      }
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  function toggleDay(i: number) {
    setSchedule((prev) => prev.map((d, idx) => idx === i ? { ...d, enabled: !d.enabled } : d));
  }

  function updateTime(i: number, field: "open" | "close", value: string) {
    setSchedule((prev) => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d));
  }

  async function handleSave() {
    setSaving(true);
    await supabase.from("business_hours").delete().eq("company_id", unitId);
    const toInsert = schedule
      .map((day, i) => ({ company_id: unitId, tenant_id: tenantId, weekday: i, open_time: day.open, close_time: day.close, closed: !day.enabled }))
      .filter((h) => !h.closed);
    if (toInsert.length > 0) await supabase.from("business_hours").insert(toInsert);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return <div className="rounded-card bg-surface-container-lowest p-5 shadow-card"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="rounded-card bg-surface-container-lowest p-5 shadow-card">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Clock size={15} className="text-[#F59E0B]" />
        Horários de funcionamento
      </h3>

      <div className="space-y-2.5">
        {schedule.map((day, i) => (
          <div key={day.name} className={cn("flex items-center gap-3", !day.enabled && "opacity-60")}>
            <span className="w-[68px] text-sm font-medium text-foreground">{day.name}</span>
            <button
              onClick={() => toggleDay(i)}
              className={cn("relative h-5 w-10 flex-shrink-0 rounded-full transition-colors", day.enabled ? "bg-[#F59E0B]" : "bg-surface-container-high")}
            >
              <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform", day.enabled ? "left-[22px]" : "left-0.5")} />
            </button>
            {day.enabled ? (
              <div className="flex items-center gap-1.5">
                <input type="time" value={day.open} onChange={(e) => updateTime(i, "open", e.target.value)} className="w-[80px] rounded-input bg-surface-container-low border-none px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40" />
                <span className="text-xs text-muted-foreground">–</span>
                <input type="time" value={day.close} onChange={(e) => updateTime(i, "close", e.target.value)} className="w-[80px] rounded-input bg-surface-container-low border-none px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40" />
              </div>
            ) : (
              <span className="text-xs italic text-muted-foreground">Fechado</span>
            )}
          </div>
        ))}
      </div>

      {/* Feriados */}
      <button
        onClick={async () => {
          setShowHolidays(!showHolidays);
          if (!showHolidays) {
            const { data } = await supabase.from("holidays").select("id, date, name").eq("company_id", unitId).order("date");
            setHolidays(data || []);
          }
        }}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-btn border border-surface-container-high px-4 py-2 text-xs font-medium text-foreground transition hover:bg-surface-container-low"
      >
        <CalendarDays size={13} />
        {showHolidays ? "Ocultar feriados" : "Exceções e feriados"}
      </button>

      {showHolidays && (
        <div className="mt-3 space-y-2">
          {holidays.map((h) => (
            <div key={h.id} className="flex items-center justify-between rounded-xl border border-surface-container-high px-3 py-2">
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
                <X size={13} />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input type="date" value={newHolidayDate} onChange={(e) => setNewHolidayDate(e.target.value)} className="flex-1 rounded-input border border-surface-container-high bg-surface-container-lowest px-2.5 py-2 text-sm" />
            <input type="text" placeholder="Nome do feriado" value={newHolidayName} onChange={(e) => setNewHolidayName(e.target.value)} className="flex-1 rounded-input border border-surface-container-high bg-surface-container-lowest px-2.5 py-2 text-sm" />
            <button
              onClick={async () => {
                if (!newHolidayDate || !newHolidayName) return;
                const { data } = await supabase.from("holidays").insert({ company_id: unitId, date: newHolidayDate, name: newHolidayName }).select().single();
                if (data) { setHolidays((prev) => [...prev, data]); setNewHolidayDate(""); setNewHolidayName(""); }
              }}
              className="rounded-btn bg-[#F59E0B] px-3 py-2 text-sm font-medium text-white hover:bg-[#D97706]"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-pill bg-[#F59E0B] px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-[#D97706] disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? "Salvo!" : saving ? "Salvando..." : "Salvar horários"}
        </button>
      </div>
    </div>
  );
}

/* ─── Card de Profissionais da Unidade ─── */
function ProfessionalsCard({ unitId, tenantId }: { unitId: string; tenantId: string }) {
  const supabase = createClient();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("professionals")
        .select("id, name, company_id")
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .order("name");
      setProfessionals(data || []);
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, tenantId]);

  async function toggleLink(prof: Professional) {
    setUpdating(prof.id);
    const isLinked = prof.company_id === unitId;
    const newCompanyId = isLinked ? null : unitId;
    await supabase.from("professionals").update({ company_id: newCompanyId }).eq("id", prof.id);
    setProfessionals((prev) => prev.map((p) => p.id === prof.id ? { ...p, company_id: newCompanyId } : p));
    setUpdating(null);
  }

  if (loading) return (
    <div className="rounded-card bg-surface-container-lowest p-5 shadow-card">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  const linked = professionals.filter((p) => p.company_id === unitId);
  const unlinked = professionals.filter((p) => p.company_id !== unitId);

  return (
    <div className="rounded-card bg-surface-container-lowest p-5 shadow-card">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Users size={15} className="text-[#F59E0B]" />
        Profissionais vinculados
        {linked.length > 0 && (
          <span className="ml-auto rounded-pill bg-[#F59E0B]/10 px-2 py-0.5 text-[11px] font-semibold text-[#F59E0B]">
            {linked.length}
          </span>
        )}
      </h3>

      {professionals.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum profissional cadastrado.</p>
      ) : (
        <div className="space-y-1.5">
          {[...linked, ...unlinked].map((prof) => {
            const isLinked = prof.company_id === unitId;
            const isBusy = updating === prof.id;
            return (
              <div
                key={prof.id}
                className={cn(
                  "flex items-center justify-between rounded-xl px-3 py-2.5 transition",
                  isLinked ? "bg-[#F59E0B]/8" : "bg-surface-container-low"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div className={cn("h-2 w-2 rounded-full", isLinked ? "bg-[#F59E0B]" : "bg-surface-container-high")} />
                  <span className="text-sm font-medium text-foreground">{prof.name}</span>
                  {prof.company_id && prof.company_id !== unitId && (
                    <span className="text-[10px] text-muted-foreground italic">Outra unidade</span>
                  )}
                </div>
                <button
                  onClick={() => toggleLink(prof)}
                  disabled={isBusy}
                  className={cn(
                    "flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-semibold transition disabled:opacity-50",
                    isLinked
                      ? "bg-surface-container text-muted-foreground hover:bg-red-50 hover:text-red-600"
                      : "bg-[#F59E0B] text-white hover:bg-[#D97706]"
                  )}
                >
                  {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : isLinked ? <X size={12} /> : <Plus size={12} />}
                  {isLinked ? "Desvincular" : "Vincular"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Linha de Unidade (Accordion) ─── */
function UnitRow({
  unit,
  tenantId,
  expanded,
  onToggle,
}: {
  unit: Unit;
  tenantId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const addrPreview = unit.address
    ? [unit.address.rua, unit.address.numero, unit.address.cidade]
        .filter(Boolean)
        .join(", ") || null
    : null;

  const initialAddress: AddressForm = {
    cep: String(unit.address?.cep ?? ""),
    rua: String(unit.address?.rua ?? ""),
    numero: String(unit.address?.numero ?? ""),
    bairro: String(unit.address?.bairro ?? ""),
    cidade: String(unit.address?.cidade ?? ""),
    estado: String(unit.address?.estado ?? ""),
    lat: unit.address?.lat ? Number(unit.address.lat) : null,
    lng: unit.address?.lng ? Number(unit.address.lng) : null,
  };

  return (
    <div className={cn("overflow-hidden rounded-card bg-surface-container-lowest shadow-card transition-all", expanded && "ring-1 ring-[#F59E0B]/30")}>
      {/* Header da unidade */}
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-surface-container-low"
      >
        <div className="flex items-center gap-3">
          <Building2 size={16} className="text-[#F59E0B]" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">{unit.name}</span>
              {unit.is_default && (
                <span className="rounded-pill bg-[#F59E0B]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#F59E0B]">
                  Principal
                </span>
              )}
            </div>
            {addrPreview && (
              <p className="mt-0.5 text-xs text-muted-foreground">{addrPreview}</p>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
      </button>

      {/* Conteúdo expandido */}
      {expanded && (
        <div className="border-t border-surface-container px-5 py-5 space-y-4">
          <AddressCard
            unitId={unit.id}
            initialAddress={initialAddress}
            onSaved={() => {}}
          />
          <ScheduleCard unitId={unit.id} tenantId={tenantId} />
          <ProfessionalsCard unitId={unit.id} tenantId={tenantId} />
        </div>
      )}
    </div>
  );
}

/* ─── Modal de Nova Unidade ─── */
function NewUnitModal({
  tenantId,
  onClose,
  onCreated,
}: {
  tenantId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const [name, setName] = useState("");
  const [addr, setAddr] = useState<AddressForm>(emptyAddress);
  const [fetchingCep, setFetchingCep] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [creating, setCreating] = useState(false);

  function update(field: keyof AddressForm, value: string | number | null) {
    setAddr((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCep(raw: string) {
    const masked = maskCep(raw);
    update("cep", masked);
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 8) {
      setFetchingCep(true);
      const result = await fetchCep(digits);
      if (result) {
        setAddr((prev) => ({
          ...prev,
          cep: masked,
          rua: result.rua,
          bairro: result.bairro,
          cidade: result.cidade,
          estado: result.estado,
          lat: null,
          lng: null,
        }));
      }
      setFetchingCep(false);
    }
  }

  async function handleGeocode() {
    setGeocoding(true);
    const coords = await geocodeAddress(addr.rua, addr.numero, addr.cidade, addr.estado);
    if (coords) setAddr((prev) => ({ ...prev, lat: coords.lat, lng: coords.lng }));
    setGeocoding(false);
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    await supabase.from("companies").insert({
      tenant_id: tenantId,
      name: name.trim(),
      address: addr,
      is_default: false,
    });
    setCreating(false);
    onCreated();
    onClose();
  }

  const labelCls = "mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground";
  const inputCls = "w-full rounded-input bg-surface-container-low border-none px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40";

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface-container-lowest p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Nova unidade</h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-surface-container-low">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Nome */}
          <div>
            <label className={labelCls}>Nome da unidade</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Unidade Centro"
              className={inputCls}
            />
          </div>

          <div className="border-t border-surface-container pt-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Endereço</p>
            <div className="grid grid-cols-12 gap-3">
              {/* CEP */}
              <div className="col-span-12 sm:col-span-5">
                <label className={labelCls}>CEP</label>
                <div className="relative">
                  <input
                    type="text"
                    value={addr.cep}
                    onChange={(e) => handleCep(e.target.value)}
                    placeholder="00000-000"
                    maxLength={9}
                    className={inputCls}
                  />
                  {fetchingCep && <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
                </div>
              </div>

              {/* Rua */}
              <div className="col-span-12 sm:col-span-7">
                <label className={labelCls}>Rua</label>
                <input type="text" value={addr.rua} onChange={(e) => update("rua", e.target.value)} className={inputCls} />
              </div>

              {/* Número */}
              <div className="col-span-4 sm:col-span-3">
                <label className={labelCls}>Número</label>
                <input type="text" value={addr.numero} onChange={(e) => update("numero", e.target.value)} className={inputCls} />
              </div>

              {/* Bairro */}
              <div className="col-span-8 sm:col-span-5">
                <label className={labelCls}>Bairro</label>
                <input type="text" value={addr.bairro} onChange={(e) => update("bairro", e.target.value)} className={inputCls} />
              </div>

              {/* Cidade */}
              <div className="col-span-12 sm:col-span-4">
                <label className={labelCls}>Cidade</label>
                <input type="text" value={addr.cidade} onChange={(e) => update("cidade", e.target.value)} className={inputCls} />
              </div>

              {/* Estado */}
              <div className="col-span-12 sm:col-span-4">
                <label className={labelCls}>Estado</label>
                <select value={addr.estado} onChange={(e) => update("estado", e.target.value)} className={inputCls}>
                  <option value="">Selecione...</option>
                  {ESTADOS_BR.map((e) => (
                    <option key={e.uf} value={e.uf}>{e.uf} - {e.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Mapa */}
          <div>
            {addr.lat && addr.lng ? (
              <MapPreview lat={addr.lat} lng={addr.lng} />
            ) : (
              <button
                onClick={handleGeocode}
                disabled={geocoding || !addr.rua || !addr.cidade}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-surface-container-high py-4 text-sm text-muted-foreground transition hover:border-[#F59E0B]/40 hover:text-foreground disabled:opacity-50"
              >
                {geocoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin size={16} />}
                {geocoding ? "Buscando localização..." : "Localizar no mapa"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-pill px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-surface-container-low">
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="flex items-center gap-2 rounded-pill bg-[#F59E0B] px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-[#D97706] disabled:opacity-60"
          >
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar unidade
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Página Principal ─── */
export default function EmpresaPage() {
  const { tenant } = useTenantStore();
  const tenantId = tenant?.id;

  const [activeTab, setActiveTab] = useState<Tab>("dados");
  const [form, setForm] = useState<FormData>({ nomeFantasia: "", razaoSocial: "", cnpj: "", descricao: "" });
  const [changeCount, setChangeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Unidades
  const [units, setUnits] = useState<Unit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null);
  const [showNewUnit, setShowNewUnit] = useState(false);

  const savedFormRef = useRef<FormData>({ nomeFantasia: "", razaoSocial: "", cnpj: "", descricao: "" });
  const supabase = createClient();

  const tabs: { key: Tab; label: string }[] = [
    { key: "dados", label: "Dados gerais" },
    { key: "unidades", label: "Unidades" },
  ];

  /* ─── Carregar dados gerais ─── */
  useEffect(() => {
    if (!tenantId) return;
    async function fetchData() {
      setLoading(true);
      try {
        const { data: companyData } = await supabase
          .from("companies")
          .select("*")
          .eq("tenant_id", tenantId!)
          .eq("is_default", true)
          .single();

        if (companyData) {
          setCompanyId(companyData.id);
          const f: FormData = {
            nomeFantasia: companyData.name || "",
            razaoSocial: companyData.razao_social || "",
            cnpj: companyData.cnpj || "",
            descricao: companyData.description || "",
          };
          setForm(f);
          savedFormRef.current = f;
          setLogoUrl(companyData.logo_url || null);
        }
      } catch (err) {
        console.error("Erro ao carregar empresa:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  /* ─── Carregar unidades ─── */
  const fetchUnits = useCallback(async () => {
    if (!tenantId) return;
    setLoadingUnits(true);
    const { data } = await supabase
      .from("companies")
      .select("id, name, is_default, address")
      .eq("tenant_id", tenantId)
      .order("is_default", { ascending: false });
    setUnits(data || []);
    setLoadingUnits(false);
  }, [tenantId, supabase]);

  useEffect(() => {
    if (activeTab === "unidades") fetchUnits();
  }, [activeTab, fetchUnits]);

  function updateForm(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setChangeCount((c) => c + 1);
  }

  function discard() {
    setForm(savedFormRef.current);
    setChangeCount(0);
  }

  async function handleSave() {
    if (!tenantId) return;
    setSaving(true);
    setAlert(null);
    try {
      const payload = {
        name: form.nomeFantasia,
        razao_social: form.razaoSocial,
        cnpj: form.cnpj,
        description: form.descricao,
        logo_url: logoUrl || null,
      };

      if (companyId) {
        const { error } = await supabase.from("companies").update(payload).eq("id", companyId);
        if (error) throw error;
      } else {
        const { data: newCompany, error } = await supabase
          .from("companies")
          .insert({ ...payload, tenant_id: tenantId, is_default: true })
          .select()
          .single();
        if (error) throw error;
        setCompanyId(newCompany.id);
      }

      savedFormRef.current = { ...form };
      setChangeCount(0);
      setAlert({ type: "success", message: "Alterações salvas com sucesso!" });
      setTimeout(() => setAlert(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar. Tente novamente.";
      setAlert({ type: "error", message: msg });
      setTimeout(() => setAlert(null), 5000);
    } finally {
      setSaving(false);
    }
  }

  /* ─── Skeleton ─── */
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-5 w-28 animate-pulse rounded bg-surface-container-low" />
            <div className="mt-2 h-8 w-64 animate-pulse rounded bg-surface-container-low" />
          </div>
        </div>
        <div className="flex gap-6 border-b border-surface-container">
          {[1, 2].map((i) => <div key={i} className="h-6 w-20 animate-pulse rounded bg-surface-container-low mb-3" />)}
        </div>
        <div className="h-[400px] animate-pulse rounded-card bg-surface-container-low" />
      </div>
    );
  }

  /* ─── Render ─── */
  return (
    <div className="space-y-6">
      {/* Alert */}
      {alert && (
        <div className={cn("flex items-center gap-3 rounded-card px-4 py-3 text-sm font-medium", alert.type === "success" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600")}>
          {alert.message}
          <button onClick={() => setAlert(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="inline-block rounded-pill bg-[#F59E0B]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-[#F59E0B]">
            Gerenciamento
          </span>
          <h1 className="mt-2 text-headline text-foreground">Configurações da Empresa</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-surface-container">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn("relative pb-3 text-sm font-medium transition", activeTab === tab.key ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {tab.label}
            {activeTab === tab.key && <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-[#F59E0B]" />}
          </button>
        ))}
      </div>

      {/* ─── Tab: Dados gerais ─── */}
      {activeTab === "dados" && (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8">
            <div className="rounded-card bg-surface-container-lowest p-6 shadow-card">
              <h2 className="mb-5 flex items-center gap-2 text-title text-foreground">
                <Building2 size={18} className="text-[#F59E0B]" />
                Informações Principais
              </h2>

              <div className="flex flex-col gap-6 sm:flex-row">
                {/* Logo */}
                <ImageUpload
                  currentUrl={logoUrl}
                  category="logos"
                  onUpload={(url) => { setLogoUrl(url || null); setChangeCount((c) => c + 1); }}
                  shape="circle"
                  size={120}
                  label="Logo"
                />

                {/* Campos */}
                <div className="flex-1 grid grid-cols-12 gap-4">
                  <div className="col-span-12 sm:col-span-6">
                    <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Nome fantasia</label>
                    <input type="text" value={form.nomeFantasia} onChange={(e) => updateForm("nomeFantasia", e.target.value)} className="w-full rounded-input bg-surface-container-low border-none px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40" />
                  </div>

                  <div className="col-span-12 sm:col-span-6">
                    <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Razão social</label>
                    <input type="text" value={form.razaoSocial} onChange={(e) => updateForm("razaoSocial", e.target.value)} className="w-full rounded-input bg-surface-container-low border-none px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40" />
                  </div>

                  <div className="col-span-12 sm:col-span-6">
                    <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">CNPJ</label>
                    <input type="text" value={form.cnpj} onChange={(e) => updateForm("cnpj", maskCnpj(e.target.value))} placeholder="00.000.000/0001-00" maxLength={18} className="w-full rounded-input bg-surface-container-low border-none px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40" />
                  </div>

                  <div className="col-span-12">
                    <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Descrição</label>
                    <textarea rows={3} value={form.descricao} onChange={(e) => updateForm("descricao", e.target.value)} className="w-full resize-none rounded-input bg-surface-container-low border-none px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#F59E0B]/40" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4">
            {changeCount > 0 && (
              <div className="sticky bottom-8 rounded-card border border-surface-container bg-surface-container-lowest/80 p-5 shadow-float backdrop-blur-md">
                <p className="mb-3 text-sm text-muted-foreground">
                  Você possui <span className="font-semibold text-foreground">{changeCount} alterações</span> não salvas
                </p>
                <div className="flex items-center gap-3">
                  <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-pill bg-[#F59E0B] px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-[#D97706] disabled:opacity-60">
                    <Save size={14} />
                    {saving ? "Salvando..." : "Salvar alterações"}
                  </button>
                  <button onClick={discard} className="flex items-center gap-2 rounded-pill px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-surface-container-low hover:text-foreground">
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
        <div className="space-y-4">
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
            <div className="space-y-3">
              {units.map((unit) => (
                <UnitRow
                  key={unit.id}
                  unit={unit}
                  tenantId={tenantId!}
                  expanded={expandedUnitId === unit.id}
                  onToggle={() => setExpandedUnitId(expandedUnitId === unit.id ? null : unit.id)}
                />
              ))}
            </div>
          )}

          {showNewUnit && tenantId && (
            <NewUnitModal
              tenantId={tenantId}
              onClose={() => setShowNewUnit(false)}
              onCreated={fetchUnits}
            />
          )}
        </div>
      )}
    </div>
  );
}
