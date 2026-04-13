"use client";

import { useState, useEffect, useCallback } from "react";

// ============ TYPES ============
interface TenantInfo {
  id: string;
  name: string;
}

interface CompanyInfo {
  id: string;
  name: string;
  logo_url: string | null;
  phone: string | null;
  address: { street?: string; number?: string; city?: string; state?: string; zip?: string } | null;
  business_hours: Array<{ weekday: number; open_time: string; close_time: string; closed: boolean }>;
}

interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
}

interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price: number;
  promo_active: boolean;
  promo_discount_pct: number | null;
}

interface Professional {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
}

interface TimeSlot {
  slot_start: string;
  slot_end: string;
}

interface WizardState {
  step: number;
  customerName: string;
  customerPhone: string;
  categoryId: string | null;
  categoryName: string;
  selectedServices: Service[];
  selectedDate: string;
  professionalId: string | null;
  professionalName: string;
  selectedSlot: TimeSlot | null;
}

interface BookingWizardProps {
  slug: string;
  tenant: TenantInfo;
  company: CompanyInfo;
}

// ============ UTILS ============
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function unformatPhone(value: string): string {
  return value.replace(/\D/g, "");
}

const STEP_LABELS = [
  "Identificação",
  "Categoria",
  "Serviço",
  "Data",
  "Profissional",
  "Horário",
  "Confirmação",
  "Sucesso",
];

const CATEGORY_EMOJIS: Record<string, string> = {
  corte: "✂️",
  barba: "🧔",
  combo: "💈",
  coloração: "🎨",
  tratamento: "💆",
  infantil: "👦",
  sobrancelha: "👁️",
  default: "💇",
};

function getCategoryEmoji(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJIS)) {
    if (lower.includes(key)) return emoji;
  }
  return CATEGORY_EMOJIS.default;
}

function generateICS(
  summary: string,
  start: Date,
  end: Date,
  location: string,
  description: string
): string {
  const pad = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d+Z/, "Z");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BarberFlow//Booking//PT",
    "BEGIN:VEVENT",
    `DTSTART:${pad(start)}`,
    `DTEND:${pad(end)}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    "STATUS:CONFIRMED",
    `UID:${Date.now()}@barberflow`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadICS(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatCompanyAddress(
  address: CompanyInfo["address"]
): string {
  if (!address) return "";
  const parts = [address.street, address.number, address.city, address.state]
    .filter(Boolean);
  return parts.join(", ");
}

function formatBusinessHours(
  hours: CompanyInfo["business_hours"]
): string {
  if (!hours || hours.length === 0) return "";
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const open = hours
    .filter((h) => !h.closed)
    .sort((a, b) => a.weekday - b.weekday);
  if (open.length === 0) return "";
  // Group consecutive days with same hours
  const groups: Array<{ days: number[]; open: string; close: string }> = [];
  for (const h of open) {
    const last = groups[groups.length - 1];
    if (
      last &&
      last.open === h.open_time &&
      last.close === h.close_time &&
      last.days[last.days.length - 1] === h.weekday - 1
    ) {
      last.days.push(h.weekday);
    } else {
      groups.push({ days: [h.weekday], open: h.open_time, close: h.close_time });
    }
  }
  return groups
    .map((g) => {
      const dayRange =
        g.days.length === 1
          ? dayNames[g.days[0]]
          : `${dayNames[g.days[0]]}-${dayNames[g.days[g.days.length - 1]]}`;
      return `${dayRange}: ${g.open.slice(0, 5)}-${g.close.slice(0, 5)}`;
    })
    .join(" | ");
}

const STORAGE_KEY = "barberflow_booking_state";

function loadState(slug: string): WizardState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${STORAGE_KEY}_${slug}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveState(slug: string, state: WizardState) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${STORAGE_KEY}_${slug}`, JSON.stringify(state));
  } catch {}
}

function clearState(slug: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(`${STORAGE_KEY}_${slug}`);
  } catch {}
}

// ============ COMPONENTS ============
function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
    </div>
  );
}

function ProgressBar({ step }: { step: number }) {
  const progress = ((step + 1) / 8) * 100;
  return (
    <div className="mb-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">
          Passo {step + 1} de 8
        </span>
        <span className="text-xs font-medium text-amber-600">
          {STEP_LABELS[step]}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full bg-amber-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ============ MAIN WIZARD ============
export function BookingWizard({ slug, tenant, company }: BookingWizardProps) {
  const [state, setState] = useState<WizardState>(() => {
    const saved = loadState(slug);
    return (
      saved || {
        step: 0,
        customerName: "",
        customerPhone: "",
        categoryId: null,
        categoryName: "",
        selectedServices: [],
        selectedDate: "",
        professionalId: null,
        professionalName: "",
        selectedSlot: null,
      }
    );
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [bookingError, setBookingError] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // Persist state
  useEffect(() => {
    saveState(slug, state);
  }, [state, slug]);

  const setStep = (step: number) => setState((s) => ({ ...s, step }));

  const goBack = () => {
    if (state.step > 0) setStep(state.step - 1);
  };

  const apiUrl = `/api/booking/${slug}`;

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}?step=categories`);
      const data = await res.json();
      setCategories(data.categories || []);
    } catch {} finally {
      setLoading(false);
    }
  }, [apiUrl]);

  // Fetch services
  const fetchServices = useCallback(async (categoryId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}?step=services&category_id=${categoryId}`);
      const data = await res.json();
      setServices(data.services || []);
    } catch {} finally {
      setLoading(false);
    }
  }, [apiUrl]);

  // Fetch professionals
  const fetchProfessionals = useCallback(async (serviceIds: string[], date: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `${apiUrl}?step=professionals&service_id=${serviceIds[0]}&date=${date}`
      );
      const data = await res.json();
      setProfessionals(data.professionals || []);
      // Auto-skip if only 1 professional
      if (data.professionals && data.professionals.length === 1) {
        const pro = data.professionals[0];
        setState((s) => ({
          ...s,
          professionalId: pro.id,
          professionalName: pro.name,
          step: 5,
        }));
        fetchSlots(pro.id, serviceIds[0], date);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [apiUrl]);

  // Fetch slots
  const fetchSlots = useCallback(async (professionalId: string, serviceId: string, date: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `${apiUrl}?step=slots&professional_id=${professionalId}&service_id=${serviceId}&date=${date}`
      );
      const data = await res.json();
      setSlots(data.slots || []);
    } catch {} finally {
      setLoading(false);
    }
  }, [apiUrl]);

  // Load data when step changes
  useEffect(() => {
    if (state.step === 1) fetchCategories();
    if (state.step === 2 && state.categoryId) fetchServices(state.categoryId);
    if (state.step === 4 && state.selectedServices.length > 0 && state.selectedDate) {
      fetchProfessionals(
        state.selectedServices.map((s) => s.id),
        state.selectedDate
      );
    }
    if (state.step === 5 && state.professionalId && state.selectedServices.length > 0 && state.selectedDate) {
      fetchSlots(state.professionalId, state.selectedServices[0].id, state.selectedDate);
    }
  }, [state.step]);

  // Book appointment
  const handleBook = async () => {
    setLoading(true);
    setBookingError("");
    try {
      const res = await fetch(`${apiUrl}?step=book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenant.id,
          company_id: company.id,
          customer_name: state.customerName,
          customer_phone: unformatPhone(state.customerPhone),
          professional_id: state.professionalId,
          services: state.selectedServices.map((s) => ({
            id: s.id,
            name: s.name,
            price: s.price,
          })),
          slot_start: state.selectedSlot?.slot_start,
          slot_end: state.selectedSlot?.slot_end,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBookingError(data.error || "Erro ao agendar. Tente novamente.");
      } else {
        setBookingSuccess(true);
        setStep(7);
        clearState(slug);
      }
    } catch {
      setBookingError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  // ============ RENDER STEPS ============

  const renderHeader = () => (
    <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm pb-3 pt-4">
      <div className="flex items-center gap-3">
        {state.step > 0 && state.step < 7 && (
          <button
            onClick={goBack}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition hover:bg-gray-200"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        <div className="flex items-center gap-2">
          {company.logo_url ? (
            <img
              src={company.logo_url}
              alt={company.name}
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold text-sm">
              {company.name.charAt(0)}
            </div>
          )}
          <span className="text-base font-semibold text-gray-900">
            {company.name}
          </span>
        </div>
      </div>
      {state.step < 7 && <ProgressBar step={state.step} />}
    </div>
  );

  // Step 0: Identification
  const renderIdentification = () => (
    <div className="space-y-6">
      <div className="rounded-[24px] bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-xl font-bold text-gray-900">
          Bem-vindo! 👋
        </h2>
        <p className="mb-6 text-sm text-gray-500">
          Informe seus dados para iniciar o agendamento
        </p>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Nome completo
            </label>
            <input
              type="text"
              placeholder="Seu nome"
              value={state.customerName}
              onChange={(e) =>
                setState((s) => ({ ...s, customerName: e.target.value }))
              }
              className="h-14 w-full rounded-[14px] border border-gray-200 px-4 text-base text-gray-900 placeholder-gray-400 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              WhatsApp
            </label>
            <input
              type="tel"
              placeholder="(11) 99999-9999"
              value={state.customerPhone}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  customerPhone: formatPhone(e.target.value),
                }))
              }
              maxLength={16}
              className="h-14 w-full rounded-[14px] border border-gray-200 px-4 text-base text-gray-900 placeholder-gray-400 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
        </div>
      </div>
      <button
        disabled={
          state.customerName.trim().length < 2 ||
          unformatPhone(state.customerPhone).length < 10
        }
        onClick={() => setStep(1)}
        className="h-14 w-full rounded-[16px] bg-amber-500 text-base font-semibold text-white shadow-lg shadow-amber-500/25 transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continuar
      </button>
    </div>
  );

  // Step 1: Categories
  const renderCategories = () => (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">
        Escolha a categoria
      </h2>
      {loading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setState((s) => ({
                  ...s,
                  categoryId: cat.id,
                  categoryName: cat.name,
                  selectedServices: [],
                  step: 2,
                }));
              }}
              className="flex flex-col items-center gap-2 rounded-[24px] bg-white p-5 shadow-sm transition hover:shadow-md hover:ring-2 hover:ring-amber-500/30"
            >
              <span className="text-3xl">{getCategoryEmoji(cat.name)}</span>
              <span className="text-sm font-semibold text-gray-800">
                {cat.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // Step 2: Services
  const renderServices = () => {
    const total = state.selectedServices.reduce((sum, s) => sum + s.price, 0);
    const totalDuration = state.selectedServices.reduce(
      (sum, s) => sum + s.duration_min,
      0
    );

    return (
      <div className="space-y-4 pb-28">
        <h2 className="text-lg font-bold text-gray-900">
          Escolha os serviços
        </h2>
        <p className="text-sm text-gray-500">{state.categoryName}</p>
        {loading ? (
          <Spinner />
        ) : (
          <div className="space-y-3">
            {services.map((svc) => {
              const selected = state.selectedServices.some(
                (s) => s.id === svc.id
              );
              return (
                <button
                  key={svc.id}
                  onClick={() => {
                    setState((s) => ({
                      ...s,
                      selectedServices: selected
                        ? s.selectedServices.filter((x) => x.id !== svc.id)
                        : [...s.selectedServices, svc],
                    }));
                  }}
                  className={`w-full rounded-[24px] p-4 text-left shadow-sm transition ${
                    selected
                      ? "bg-amber-50 ring-2 ring-amber-500"
                      : "bg-white hover:ring-2 hover:ring-amber-500/30"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{svc.name}</p>
                      {svc.description && (
                        <p className="mt-1 text-xs text-gray-500">
                          {svc.description}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                          {svc.duration_min} min
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-base font-bold text-amber-600">
                        {formatCurrency(svc.price)}
                      </span>
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-md border-2 transition ${
                          selected
                            ? "border-amber-500 bg-amber-500"
                            : "border-gray-300"
                        }`}
                      >
                        {selected && (
                          <svg
                            width="14"
                            height="14"
                            fill="none"
                            stroke="white"
                            strokeWidth="3"
                            viewBox="0 0 24 24"
                          >
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {/* Sticky bottom bar */}
        {state.selectedServices.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 border-t border-gray-100 bg-white/95 p-4 backdrop-blur-sm">
            <div className="mx-auto max-w-[480px]">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {state.selectedServices.length} serviço(s) &middot;{" "}
                  {totalDuration} min
                </span>
                <span className="font-bold text-gray-900">
                  {formatCurrency(total)}
                </span>
              </div>
              <button
                onClick={() => setStep(3)}
                className="h-14 w-full rounded-[16px] bg-amber-500 text-base font-semibold text-white shadow-lg shadow-amber-500/25 transition hover:bg-amber-600"
              >
                Continuar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Step 3: Date
  const renderDate = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: Date[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    const formatDateStr = (d: Date) =>
      d.toISOString().split("T")[0];

    const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const months = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
    ];

    const todayStr = formatDateStr(today);
    const tomorrowStr = formatDateStr(
      new Date(today.getTime() + 86400000)
    );

    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Escolha a data</h2>

        {/* Quick chips */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setState((s) => ({ ...s, selectedDate: todayStr, step: 4 }));
            }}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              state.selectedDate === todayStr
                ? "bg-amber-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Hoje
          </button>
          <button
            onClick={() => {
              setState((s) => ({ ...s, selectedDate: tomorrowStr, step: 4 }));
            }}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              state.selectedDate === tomorrowStr
                ? "bg-amber-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Amanhã
          </button>
        </div>

        {/* Calendar grid */}
        <div className="rounded-[24px] bg-white p-4 shadow-sm">
          <p className="mb-3 text-center text-sm font-semibold text-gray-700">
            {months[today.getMonth()]} {today.getFullYear()}
          </p>
          <div className="mb-2 grid grid-cols-7 gap-1">
            {weekDays.map((wd) => (
              <div
                key={wd}
                className="text-center text-xs font-medium text-gray-400"
              >
                {wd}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {/* Offset for first day of week */}
            {Array.from({ length: days[0].getDay() }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {days.map((d) => {
              const dateStr = formatDateStr(d);
              const isPast = d < today;
              const isSelected = state.selectedDate === dateStr;
              const isToday = dateStr === todayStr;

              return (
                <button
                  key={dateStr}
                  disabled={isPast}
                  onClick={() => {
                    setState((s) => ({ ...s, selectedDate: dateStr, step: 4 }));
                  }}
                  className={`flex h-10 w-full items-center justify-center rounded-full text-sm font-medium transition ${
                    isPast
                      ? "cursor-not-allowed text-gray-300"
                      : isSelected
                      ? "bg-amber-500 text-white shadow-md"
                      : isToday
                      ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Step 4: Professional
  const renderProfessional = () => (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">
        Escolha o profissional
      </h2>
      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          {/* No preference card */}
          <button
            onClick={() => {
              // Pick first available professional for "sem preferência"
              if (professionals.length > 0) {
                setState((s) => ({
                  ...s,
                  professionalId: professionals[0].id,
                  professionalName: "Sem preferência",
                  step: 5,
                }));
              }
            }}
            className="w-full rounded-[24px] bg-gradient-to-r from-amber-400 to-amber-500 p-5 text-left shadow-sm transition hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/30">
                <svg
                  width="24"
                  height="24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-white">Sem preferência</p>
                <p className="text-xs text-white/80">
                  Qualquer profissional disponível
                </p>
              </div>
            </div>
          </button>

          {professionals.map((pro) => (
            <button
              key={pro.id}
              onClick={() => {
                setState((s) => ({
                  ...s,
                  professionalId: pro.id,
                  professionalName: pro.name,
                  step: 5,
                }));
              }}
              className="w-full rounded-[24px] bg-white p-5 text-left shadow-sm transition hover:ring-2 hover:ring-amber-500/30 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                {pro.avatar_url ? (
                  <img
                    src={pro.avatar_url}
                    alt={pro.name}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold">
                    {pro.name.charAt(0)}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900">{pro.name}</p>
                  {pro.bio && (
                    <p className="text-xs text-gray-500">{pro.bio}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // Step 5: Time Slots
  const renderTimeSlots = () => {
    const morning: TimeSlot[] = [];
    const afternoon: TimeSlot[] = [];

    slots.forEach((slot) => {
      const hour = new Date(slot.slot_start).getHours();
      if (hour < 12) morning.push(slot);
      else afternoon.push(slot);
    });

    const formatTime = (iso: string) => {
      const d = new Date(iso);
      return `${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes()
      ).padStart(2, "0")}`;
    };

    const renderGroup = (label: string, items: TimeSlot[]) =>
      items.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-semibold text-gray-500">{label}</p>
          <div className="grid grid-cols-3 gap-2">
            {items.map((slot) => {
              const isSelected =
                state.selectedSlot?.slot_start === slot.slot_start;
              return (
                <button
                  key={slot.slot_start}
                  onClick={() => {
                    setState((s) => ({ ...s, selectedSlot: slot, step: 6 }));
                  }}
                  className={`h-12 rounded-[14px] text-sm font-semibold transition ${
                    isSelected
                      ? "bg-amber-500 text-white shadow-md"
                      : "border-2 border-amber-300 bg-white text-gray-800 hover:bg-amber-50"
                  }`}
                >
                  {formatTime(slot.slot_start)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null;

    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-gray-900">
          Escolha o horário
        </h2>
        <p className="text-sm text-gray-500">
          {new Date(state.selectedDate + "T12:00:00").toLocaleDateString(
            "pt-BR",
            { weekday: "long", day: "numeric", month: "long" }
          )}
        </p>
        {loading ? (
          <Spinner />
        ) : slots.length === 0 ? (
          <div className="rounded-[24px] bg-white p-8 text-center shadow-sm">
            <p className="text-gray-500">
              Nenhum horário disponível nesta data.
            </p>
            <button
              onClick={() => setStep(3)}
              className="mt-4 text-sm font-semibold text-amber-600 hover:underline"
            >
              Escolher outra data
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {renderGroup("Manhã", morning)}
            {renderGroup("Tarde", afternoon)}
          </div>
        )}
      </div>
    );
  };

  // Step 6: Confirmation
  const renderConfirmation = () => {
    const total = state.selectedServices.reduce((sum, s) => sum + s.price, 0);
    const totalDuration = state.selectedServices.reduce(
      (sum, s) => sum + s.duration_min,
      0
    );
    const slotTime = state.selectedSlot
      ? new Date(state.selectedSlot.slot_start).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    const dateFormatted = state.selectedDate
      ? new Date(state.selectedDate + "T12:00:00").toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })
      : "";

    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-gray-900">
          Confirme seu agendamento
        </h2>

        <div className="rounded-[24px] bg-white p-5 shadow-sm space-y-4">
          {/* Customer */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Cliente</p>
              <p className="font-medium text-gray-900">{state.customerName}</p>
              <p className="text-sm text-gray-500">{state.customerPhone}</p>
            </div>
            <button onClick={() => setStep(0)} className="text-amber-600 hover:text-amber-700">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          </div>

          <hr className="border-gray-100" />

          {/* Services */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500">Serviços</p>
              {state.selectedServices.map((s) => (
                <p key={s.id} className="text-sm font-medium text-gray-900">
                  {s.name} — {formatCurrency(s.price)}
                </p>
              ))}
              <p className="mt-1 text-xs text-gray-400">
                Duração total: {totalDuration} min
              </p>
            </div>
            <button onClick={() => setStep(2)} className="text-amber-600 hover:text-amber-700">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          </div>

          <hr className="border-gray-100" />

          {/* Date & Time */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Data e horário</p>
              <p className="font-medium text-gray-900">
                {dateFormatted} às {slotTime}
              </p>
            </div>
            <button onClick={() => setStep(3)} className="text-amber-600 hover:text-amber-700">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          </div>

          <hr className="border-gray-100" />

          {/* Professional */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Profissional</p>
              <p className="font-medium text-gray-900">
                {state.professionalName}
              </p>
            </div>
            <button onClick={() => setStep(4)} className="text-amber-600 hover:text-amber-700">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          </div>

          <hr className="border-gray-100" />

          {/* Total */}
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900">Total</p>
            <p className="text-lg font-bold text-amber-600">
              {formatCurrency(total)}
            </p>
          </div>
        </div>

        {bookingError && (
          <div className="rounded-[14px] bg-red-50 p-3 text-center text-sm text-red-600">
            {bookingError}
          </div>
        )}

        <button
          onClick={handleBook}
          disabled={loading}
          className="h-14 w-full rounded-[16px] bg-amber-500 text-base font-semibold text-white shadow-lg shadow-amber-500/25 transition hover:bg-amber-600 disabled:opacity-50"
        >
          {loading ? "Agendando..." : "Confirmar agendamento"}
        </button>
      </div>
    );
  };

  // Step 7: Success
  const [shareTooltip, setShareTooltip] = useState(false);

  const renderSuccess = () => {
    const slotTime = state.selectedSlot
      ? new Date(state.selectedSlot.slot_start).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    const dateFormatted = state.selectedDate
      ? new Date(state.selectedDate + "T12:00:00").toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })
      : "";

    const bookingUrl = typeof window !== "undefined" ? window.location.href : "";
    const companyLocation = formatCompanyAddress(company.address);

    const handleAddToCalendar = () => {
      if (!state.selectedSlot) return;
      const startDate = new Date(state.selectedSlot.slot_start);
      const endDate = new Date(state.selectedSlot.slot_end);
      const summary = `${state.selectedServices.map((s) => s.name).join(", ")} - ${company.name}`;
      const description = `Profissional: ${state.professionalName}\\nServicos: ${state.selectedServices.map((s) => s.name).join(", ")}`;
      const icsContent = generateICS(summary, startDate, endDate, companyLocation, description);
      downloadICS(icsContent, `agendamento-${company.name.replace(/\s+/g, "-").toLowerCase()}.ics`);
    };

    const handleBookAnother = () => {
      clearState(slug);
      setState({
        step: 1,
        customerName: state.customerName,
        customerPhone: state.customerPhone,
        categoryId: null,
        categoryName: "",
        selectedServices: [],
        selectedDate: "",
        professionalId: null,
        professionalName: "",
        selectedSlot: null,
      });
    };

    const handleShare = async () => {
      const shareData = {
        title: `Agende em ${company.name}`,
        text: `Agende seu horario em ${company.name}!`,
        url: bookingUrl,
      };
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share(shareData);
        } catch {
          // User cancelled or share failed — ignore
        }
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(bookingUrl);
        setShareTooltip(true);
        setTimeout(() => setShareTooltip(false), 2000);
      }
    };

    return (
      <div className="space-y-6 text-center">
        {/* Success animation */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <svg
            width="40"
            height="40"
            fill="none"
            stroke="#22c55e"
            strokeWidth="3"
            viewBox="0 0 24 24"
            className="animate-bounce"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Agendamento confirmado!
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Voce recebera uma confirmacao por WhatsApp
          </p>
        </div>

        <div className="rounded-[24px] bg-white p-5 shadow-sm text-left space-y-2">
          <p className="text-sm text-gray-600">
            <span className="font-semibold">Data:</span> {dateFormatted} as{" "}
            {slotTime}
          </p>
          <p className="text-sm text-gray-600">
            <span className="font-semibold">Profissional:</span>{" "}
            {state.professionalName}
          </p>
          <p className="text-sm text-gray-600">
            <span className="font-semibold">Servicos:</span>{" "}
            {state.selectedServices.map((s) => s.name).join(", ")}
          </p>
        </div>

        <div className="space-y-3">
          {/* Add to calendar — .ics download */}
          <button
            onClick={handleAddToCalendar}
            className="h-14 w-full rounded-[16px] border-2 border-amber-500 bg-white text-base font-semibold text-amber-600 transition hover:bg-amber-50 flex items-center justify-center gap-2"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            Adicionar ao calendario
          </button>

          {/* Book another service — resets to step 1 (categories) */}
          <button
            onClick={handleBookAnother}
            className="h-14 w-full rounded-[16px] bg-amber-500 text-base font-semibold text-white shadow-lg shadow-amber-500/25 transition hover:bg-amber-600 flex items-center justify-center gap-2"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Agendar outro servico
          </button>

          {/* Share button — Web Share API with clipboard fallback */}
          <div className="relative">
            <button
              onClick={handleShare}
              className="h-14 w-full rounded-[16px] border-2 border-gray-200 bg-white text-base font-semibold text-gray-700 transition hover:bg-gray-50 flex items-center justify-center gap-2"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
              </svg>
              Compartilhar
            </button>
            {shareTooltip && (
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-lg bg-gray-800 px-3 py-1 text-xs text-white">
                Link copiado!
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ============ FOOTER ============
  const renderFooter = () => {
    const addr = formatCompanyAddress(company.address);
    const hours = formatBusinessHours(company.business_hours);

    return (
      <footer className="mt-10 border-t border-gray-100 pt-4 pb-6 text-center space-y-3">
        {/* Trust signals: Rating */}
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-amber-500 text-sm">&#11088;</span>
          <span className="text-xs font-semibold text-gray-600">4.8</span>
          <span className="text-xs text-gray-400">(120+ atendimentos)</span>
        </div>

        {/* Business hours */}
        {hours && (
          <div className="flex items-center justify-center gap-1.5">
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-gray-400">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <p className="text-xs text-gray-500">{hours}</p>
          </div>
        )}

        {/* Address */}
        {addr && (
          <div className="flex items-center justify-center gap-1.5">
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-gray-400">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <p className="text-xs text-gray-500">{addr}</p>
          </div>
        )}

        {/* Phone */}
        {company.phone && (
          <div className="flex items-center justify-center gap-1.5">
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-gray-400">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
            </svg>
            <p className="text-xs text-gray-500">{formatPhone(company.phone)}</p>
          </div>
        )}

        <p className="mt-2 text-[10px] text-gray-300">
          Powered by BarberFlow
        </p>
      </footer>
    );
  };

  // ============ MAIN RENDER ============
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-[480px] px-6 pb-8">
        {renderHeader()}
        <div className="pt-2">
          {state.step === 0 && renderIdentification()}
          {state.step === 1 && renderCategories()}
          {state.step === 2 && renderServices()}
          {state.step === 3 && renderDate()}
          {state.step === 4 && renderProfessional()}
          {state.step === 5 && renderTimeSlots()}
          {state.step === 6 && renderConfirmation()}
          {state.step === 7 && renderSuccess()}
        </div>
        {renderFooter()}
      </div>
    </div>
  );
}
