"use client";

import { useState, useEffect, useCallback } from "react";
import { Star, Plus, X, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { maskPhone } from "@/lib/masks";
import { createClient } from "@/lib/supabase/client";
import { useTenantStore } from "@/stores/tenant-store";
import { ImageUpload } from "@/components/ui/image-upload";

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

      // Create professional
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

      // Link services
      if (selectedServices.length > 0) {
        const { error: servError } = await supabase
          .from("professional_services")
          .insert(
            selectedServices.map((sid) => ({
              professional_id: prof.id,
              service_id: sid,
            }))
          );
        if (servError) {
          console.error("Erro ao vincular serviços:", servError);
          // Continue - professional was created, services can be linked later
        }
      }

      // Create schedule for active days
      if (selectedDays.length > 0) {
        const { error: schedError } = await supabase
          .from("professional_schedules")
          .insert(
            selectedDays.map((day) => ({
              professional_id: prof.id,
              weekday: day,
              start_time: horarioInicio,
              end_time: horarioTermino,
            }))
          );
        if (schedError) {
          console.error("Erro ao criar agenda:", schedError);
          // Continue - professional was created, schedule can be set later
        }
      }

      // Reset form
      setNome("");
      setPhone("");
      setEmail("");
      setBio("");
      setAvatarUrl(null);
      setSelectedServices([]);
      setCommission(30);
      setSelectedDays([1, 2, 3, 4, 5]);
      setHorarioInicio("09:00");
      setHorarioTermino("18:00");

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
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">
            Novo Profissional
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground transition hover:bg-surface-container-low"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Avatar Upload */}
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

          {/* Nome Completo */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Nome Completo
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: João da Silva"
              className="w-full rounded-xl border border-muted-foreground/20 bg-surface-container-lowest px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Telefone */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Telefone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              placeholder="+55 (11) 99999-0000"
              className="w-full rounded-xl border border-muted-foreground/20 bg-surface-container-lowest px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className="w-full rounded-xl border border-muted-foreground/20 bg-surface-container-lowest px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Bio / Especialidade */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Bio / Especialidade
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Descreva a especialidade do profissional..."
              rows={3}
              className="w-full resize-none rounded-xl border border-muted-foreground/20 bg-surface-container-lowest px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Serviços */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Serviços
            </label>
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
                <p className="text-sm text-muted-foreground">
                  Nenhum serviço cadastrado ainda.
                </p>
              )}
            </div>
          </div>

          {/* Comissão Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                Comissão
              </label>
              <span className="text-sm font-bold text-primary">
                {commission}%
              </span>
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

          {/* Disponibilidade */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Disponibilidade
            </label>
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

          {/* Horário */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="flex items-center gap-1 text-sm font-medium text-foreground">
                <Clock size={14} />
                Horário Início
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
                <Clock size={14} />
                Horário Término
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

        {/* Footer */}
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

export default function ProfissionaisPage() {
  const { tenant } = useTenantStore();
  const [modalOpen, setModalOpen] = useState(false);
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
    Promise.all([fetchProfessionals(), fetchServices()]).finally(() =>
      setLoading(false)
    );
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
          <p className="mb-2 text-lg font-medium text-foreground">
            Nenhum profissional cadastrado
          </p>
          <p className="mb-6 text-sm text-muted-foreground">
            Adicione seu primeiro profissional
          </p>
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
          {/* Professional Cards */}
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
                        {professional.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </div>
                    )}
                  </div>
                  {/* Star badge */}
                  <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 shadow-md">
                    <Star size={14} className="fill-white text-white" />
                  </div>
                </div>
              </div>

              {/* Name & Bio */}
              <div className="mb-4 text-center">
                <h3 className="text-xl font-bold text-foreground">
                  {professional.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {professional.bio || "Profissional"}
                </p>
              </div>

              {/* Stats Row */}
              <div className="mb-6 flex items-center justify-center rounded-xl bg-surface-container-low px-4 py-3">
                <div className="text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Comissão
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    {professional.commission_pct}%
                  </p>
                </div>
              </div>

              {/* Button */}
              <button className="w-full rounded-full border border-primary py-3 text-sm font-medium text-primary transition hover:bg-primary hover:text-white">
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
              <Plus
                size={28}
                className="text-muted-foreground transition group-hover:text-amber-500"
              />
            </div>
            <span className="text-sm font-medium text-muted-foreground transition group-hover:text-foreground">
              Adicionar profissional
            </span>
          </button>
        </div>
      )}

      {/* Modal */}
      <NewProfessionalModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleSuccess}
        services={services}
      />
    </div>
  );
}
