"use client";

import { useState, useEffect, useCallback } from "react";
import { Star, Plus, X, Clock, Loader2, Phone, Mail, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import { maskPhone } from "@/lib/masks";
import { createClient } from "@/lib/supabase/client";
import { useTenantStore } from "@/stores/tenant-store";
import { ImageUpload } from "@/components/ui/image-upload";
import { formatCurrency } from "@/lib/utils";

interface Professional {
  id: string;
  name: string;
  bio: string | null;
  phone: string | null;
  email: string | null;
  commission_pct: number;
  avatar_url: string | null;
  active: boolean;
}

interface Service {
  id: string;
  name: string;
}

const daysOfWeek = ["D", "S", "T", "Q", "Q", "S", "S"];
const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// ─── Professional Detail Modal ────────────────────────────────────────────────

function ProfessionalDetailModal({
  professional,
  onClose,
}: {
  professional: Professional;
  onClose: () => void;
}) {
  const { tenant } = useTenantStore();
  const [loading, setLoading] = useState(true);
  const [linkedServices, setLinkedServices] = useState<Service[]>([]);
  const [schedule, setSchedule] = useState<Array<{ weekday: number; start_time: string; end_time: string }>>([]);
  const [previsao, setPrevisao] = useState(0);
  const [faturamento, setFaturamento] = useState(0);
  const [appointmentCount, setAppointmentCount] = useState(0);

  useEffect(() => {
    async function load() {
      if (!tenant?.id) return;
      const supabase = createClient();

      // Services linked to this professional
      const { data: links } = await supabase
        .from("professional_services")
        .select("service_id, services(id, name)")
        .eq("professional_id", professional.id);
      setLinkedServices(
        (links || [])
          .map((l) => (l.services as unknown as Service | null))
          .filter(Boolean) as Service[]
      );

      // Schedule
      const { data: sched } = await supabase
        .from("professional_schedules")
        .select("weekday, start_time, end_time")
        .eq("professional_id", professional.id)
        .order("weekday");
      setSchedule(sched || []);

      // Current month bounds
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

      // Previsão: pendente + confirmado this month
      const { data: activeAppts } = await supabase
        .from("appointments")
        .select("total_price")
        .eq("tenant_id", tenant.id)
        .eq("professional_id", professional.id)
        .in("status", ["pendente", "confirmado"])
        .gte("start_at", monthStart)
        .lt("start_at", monthEnd);

      // Faturamento: concluido this month
      const { data: completedAppts } = await supabase
        .from("appointments")
        .select("total_price")
        .eq("tenant_id", tenant.id)
        .eq("professional_id", professional.id)
        .eq("status", "concluido")
        .gte("start_at", monthStart)
        .lt("start_at", monthEnd);

      const prevTotal = (activeAppts || []).reduce((sum, a) => sum + Number(a.total_price || 0), 0);
      const fatTotal = (completedAppts || []).reduce((sum, a) => sum + Number(a.total_price || 0), 0);
      setPrevisao(Math.round(prevTotal * 100) / 100);
      setFaturamento(Math.round(fatTotal * 100) / 100);

      // Count: all appointments this month (bounded to month)
      const { count } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.id)
        .eq("professional_id", professional.id)
        .gte("start_at", monthStart)
        .lt("start_at", monthEnd);
      setAppointmentCount(count || 0);

      setLoading(false);
    }
    load();
  }, [professional.id, tenant?.id]);

  const monthName = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[20px] bg-surface-container-lowest p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-foreground">Detalhes do Profissional</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground transition hover:bg-surface-container-low"
          >
            <X size={20} />
          </button>
        </div>

        {/* Profile */}
        <div className="mb-6 flex items-center gap-5">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-surface-container-low">
            {professional.avatar_url ? (
              <img src={professional.avatar_url} alt={professional.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl font-bold text-muted-foreground">
                {professional.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
            )}
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground">{professional.name}</h3>
            {professional.bio && <p className="mt-1 text-sm text-muted-foreground">{professional.bio}</p>}
            <div className="mt-2 flex flex-wrap gap-3">
              {professional.phone && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone size={12} /> {professional.phone}
                </span>
              )}
              {professional.email && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Mail size={12} /> {professional.email}
                </span>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={28} className="animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Month summary */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
                Resumo de {monthName}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-surface-container-low p-3 text-center">
                  <p className="text-xl font-bold text-foreground">{appointmentCount}</p>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Agendamentos</p>
                </div>
                <div className="rounded-xl bg-purple-50 p-3 text-center">
                  <p className="text-sm font-bold text-purple-700">{formatCurrency(previsao)}</p>
                  <p className="text-[10px] font-semibold uppercase text-purple-500">Previsão</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3 text-center">
                  <p className="text-sm font-bold text-emerald-700">{formatCurrency(faturamento)}</p>
                  <p className="text-[10px] font-semibold uppercase text-emerald-500">Faturamento</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3 text-center">
                  <p className="text-sm font-bold text-amber-700">
                    {formatCurrency(Math.round((previsao + faturamento) * professional.commission_pct / 100 * 100) / 100)}
                  </p>
                  <p className="text-[10px] font-semibold uppercase text-amber-500">Comissão ({professional.commission_pct}%)</p>
                </div>
              </div>
            </div>

            {/* Services */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                <Scissors size={11} className="mr-1 inline" />
                Serviços
              </p>
              {linkedServices.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum serviço vinculado</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {linkedServices.map((svc) => (
                    <span
                      key={svc.id}
                      className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"
                    >
                      {svc.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Schedule */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                <Clock size={11} className="mr-1 inline" />
                Agenda semanal
              </p>
              {schedule.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem horários cadastrados</p>
              ) : (
                <div className="space-y-1">
                  {schedule.map((s) => (
                    <div key={s.weekday} className="flex items-center justify-between rounded-lg bg-surface-container-low px-3 py-2">
                      <span className="text-sm font-medium text-foreground">{DAY_NAMES[s.weekday]}</span>
                      <span className="text-sm text-muted-foreground">
                        {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── New Professional Modal ───────────────────────────────────────────────────

function NewProfessionalModal({
  open,
  onClose,
  onSuccess,
  services,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  services: Service[];
}) {
  const { tenant, company } = useTenantStore();
  const [nome, setNome] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [commission, setCommission] = useState(30);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [horarioInicio, setHorarioInicio] = useState("09:00");
  const [horarioTermino, setHorarioTermino] = useState("18:00");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const toggleService = (serviceId: string) => {
    setSelectedServices((prev) =>
      prev.includes(serviceId)
        ? prev.filter((s) => s !== serviceId)
        : [...prev, serviceId]
    );
  };

  const toggleDay = (dayIndex: number) => {
    setSelectedDays((prev) =>
      prev.includes(dayIndex)
        ? prev.filter((d) => d !== dayIndex)
        : [...prev, dayIndex]
    );
  };

  const handleSave = async () => {
    if (!nome.trim() || !tenant?.id) return;
    setSaving(true);

    try {
      const supabase = createClient();
      const tenantId = tenant.id;
      const companyId = company?.id;

      const { data: prof, error: profError } = await supabase
        .from("professionals")
        .insert({
          tenant_id: tenantId,
          company_id: companyId,
          name: nome.trim(),
          phone: phone.replace(/\D/g, "") || null,
          email: email.trim() || null,
          bio: bio.trim() || null,
          avatar_url: avatarUrl || null,
          commission_pct: commission,
        })
        .select()
        .single();

      if (profError || !prof) {
        console.error("Erro ao criar profissional:", profError);
        return;
      }

      if (selectedServices.length > 0) {
        await supabase.from("professional_services").insert(
          selectedServices.map((sid) => ({ professional_id: prof.id, service_id: sid }))
        );
      }

      if (selectedDays.length > 0) {
        await supabase.from("professional_schedules").insert(
          selectedDays.map((day) => ({
            professional_id: prof.id,
            weekday: day,
            start_time: horarioInicio,
            end_time: horarioTermino,
          }))
        );
      }

      setNome(""); setPhone(""); setEmail(""); setBio(""); setAvatarUrl(null);
      setSelectedServices([]); setCommission(30); setSelectedDays([1, 2, 3, 4, 5]);
      setHorarioInicio("09:00"); setHorarioTermino("18:00");

      onSuccess();
    } catch (err) {
      console.error("Erro inesperado:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[20px] bg-surface-container-lowest p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">Novo Profissional</h2>
          <button onClick={onClose} className="rounded-full p-2 text-muted-foreground transition hover:bg-surface-container-low">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6">
          <div className="flex justify-center">
            <ImageUpload
              currentUrl={avatarUrl}
              category="avatars"
              onUpload={(url) => setAvatarUrl(url || null)}
              shape="circle"
              size={112}
              label="Foto"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Nome Completo</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: João da Silva"
              className="w-full rounded-xl border border-muted-foreground/20 bg-surface-container-lowest px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Telefone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              placeholder="+55 (11) 99999-0000"
              className="w-full rounded-xl border border-muted-foreground/20 bg-surface-container-lowest px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className="w-full rounded-xl border border-muted-foreground/20 bg-surface-container-lowest px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Bio / Especialidade</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Descreva a especialidade do profissional..."
              rows={3}
              className="w-full resize-none rounded-xl border border-muted-foreground/20 bg-surface-container-lowest px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Serviços</label>
            <div className="flex flex-wrap gap-2">
              {services.map((service) => (
                <button
                  key={service.id}
                  onClick={() => toggleService(service.id)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition",
                    selectedServices.includes(service.id)
                      ? "bg-amber-500 text-white"
                      : "bg-surface-container-low text-muted-foreground hover:bg-surface-container"
                  )}
                >
                  {service.name}
                </button>
              ))}
              {services.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum serviço cadastrado ainda.</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Comissão</label>
              <span className="text-sm font-bold text-primary">{commission}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={commission}
              onChange={(e) => setCommission(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Disponibilidade</label>
            <div className="flex gap-2">
              {daysOfWeek.map((day, index) => (
                <button
                  key={index}
                  onClick={() => toggleDay(index)}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition",
                    selectedDays.includes(index)
                      ? "bg-primary text-white"
                      : "bg-surface-container-low text-muted-foreground hover:bg-surface-container"
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="flex items-center gap-1 text-sm font-medium text-foreground">
                <Clock size={14} /> Horário Início
              </label>
              <input
                type="time"
                value={horarioInicio}
                onChange={(e) => setHorarioInicio(e.target.value)}
                className="w-full rounded-xl border border-muted-foreground/20 bg-surface-container-lowest px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-1 text-sm font-medium text-foreground">
                <Clock size={14} /> Horário Término
              </label>
              <input
                type="time"
                value={horarioTermino}
                onChange={(e) => setHorarioTermino(e.target.value)}
                className="w-full rounded-xl border border-muted-foreground/20 bg-surface-container-lowest px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-full px-6 py-3 text-sm font-medium text-muted-foreground transition hover:bg-surface-container-low"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !nome.trim()}
            className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            Salvar Profissional
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProfissionaisPage() {
  const { tenant } = useTenantStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [detailProfessional, setDetailProfessional] = useState<Professional | null>(null);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfessionals = useCallback(async () => {
    if (!tenant?.id) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("professionals")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("active", true);

    if (error) {
      console.error("Erro ao buscar profissionais:", error);
    } else {
      setProfessionals(data || []);
    }
  }, [tenant?.id]);

  const fetchServices = useCallback(async () => {
    if (!tenant?.id) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("services")
      .select("id, name")
      .eq("tenant_id", tenant.id)
      .eq("active", true);

    if (error) {
      console.error("Erro ao buscar serviços:", error);
    } else {
      setServices(data || []);
    }
  }, [tenant?.id]);

  useEffect(() => {
    if (!tenant?.id) return;
    setLoading(true);
    Promise.all([fetchProfessionals(), fetchServices()]).finally(() => setLoading(false));
  }, [tenant?.id, fetchProfessionals, fetchServices]);

  const handleSuccess = () => {
    setModalOpen(false);
    fetchProfessionals();
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-foreground">Profissionais</h1>
        <p className="mt-2 text-muted-foreground">
          Gerencie a equipe de profissionais da sua barbearia
        </p>
      </div>

      {/* Empty State */}
      {professionals.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-muted-foreground/20 py-16">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-low">
            <Plus size={28} className="text-muted-foreground" />
          </div>
          <p className="mb-2 text-lg font-medium text-foreground">Nenhum profissional cadastrado</p>
          <p className="mb-6 text-sm text-muted-foreground">Adicione seu primeiro profissional</p>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-white transition hover:opacity-90"
          >
            Adicionar profissional
          </button>
        </div>
      )}

      {/* Grid */}
      {professionals.length > 0 && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {professionals.map((professional) => (
            <div
              key={professional.id}
              className="group rounded-[20px] bg-surface-container-lowest p-8 transition hover:shadow-xl"
            >
              {/* Avatar */}
              <div className="mb-4 flex justify-center">
                <div className="relative">
                  <div className="h-24 w-24 overflow-hidden rounded-full bg-surface-container-low transition grayscale group-hover:grayscale-0">
                    {professional.avatar_url ? (
                      <img
                        src={professional.avatar_url}
                        alt={professional.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted-foreground">
                        {professional.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                    )}
                  </div>
                  <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 shadow-md">
                    <Star size={14} className="fill-white text-white" />
                  </div>
                </div>
              </div>

              {/* Name & Bio */}
              <div className="mb-4 text-center">
                <h3 className="text-xl font-bold text-foreground">{professional.name}</h3>
                <p className="text-sm text-muted-foreground">{professional.bio || "Profissional"}</p>
              </div>

              {/* Stats Row */}
              <div className="mb-6 flex items-center justify-center rounded-xl bg-surface-container-low px-4 py-3">
                <div className="text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Comissão</p>
                  <p className="text-lg font-bold text-foreground">{professional.commission_pct}%</p>
                </div>
              </div>

              {/* Button */}
              <button
                onClick={() => setDetailProfessional(professional)}
                className="w-full rounded-full border border-primary py-3 text-sm font-medium text-primary transition hover:bg-primary hover:text-white"
              >
                Ver detalhes
              </button>
            </div>
          ))}

          {/* Add Card */}
          <button
            onClick={() => setModalOpen(true)}
            className="group flex flex-col items-center justify-center gap-4 rounded-[20px] border-2 border-dashed border-muted-foreground/30 p-8 transition hover:border-amber-500 hover:bg-surface-container-low"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-low transition group-hover:bg-amber-500/10">
              <Plus size={28} className="text-muted-foreground transition group-hover:text-amber-500" />
            </div>
            <span className="text-sm font-medium text-muted-foreground transition group-hover:text-foreground">
              Adicionar profissional
            </span>
          </button>
        </div>
      )}

      {/* Modals */}
      <NewProfessionalModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleSuccess}
        services={services}
      />

      {detailProfessional && (
        <ProfessionalDetailModal
          professional={detailProfessional}
          onClose={() => setDetailProfessional(null)}
        />
      )}
    </div>
  );
}
