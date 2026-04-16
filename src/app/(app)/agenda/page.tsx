"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  Clock,
  User,
  X,
  Filter,
  Scissors,
  MessageCircle,
  RefreshCw,
  CheckCircle2,
  Ban,
  CalendarDays,
  CalendarRange,
  List,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useTenantStore } from "@/stores/tenant-store";
import { maskPhone } from "@/lib/masks";
import { useRealtime } from "@/hooks/use-realtime";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";

// ===== TYPES =====
type AppointmentStatus = "pendente" | "confirmado" | "concluido" | "cancelado" | "reagendado";
type ViewMode = "day" | "week" | "month" | "list";

interface Professional {
  id: string;
  name: string;
  role?: string;
  avatar_url?: string;
  active: boolean;
}

interface AppointmentRow {
  id: string;
  tenant_id: string;
  professional_id: string;
  contact_id: string;
  start_at: string;
  end_at: string;
  status: AppointmentStatus;
  notes?: string;
  cancel_reason?: string | null;
  rating?: number | null;
  contacts: {
    id: string;
    name: string;
    phone?: string;
    avatar_url?: string;
  } | null;
  professionals: {
    id: string;
    name: string;
    avatar_url?: string;
  } | null;
  appointment_services: {
    services: {
      id: string;
      name: string;
      duration_min: number;
      price: number;
    };
  }[];
}

// ===== UTILS =====
function generateTimeSlots() {
  const slots: string[] = [];
  for (let h = 8; h <= 20; h++) {
    slots.push(`${h.toString().padStart(2, "0")}:00`);
  }
  return slots;
}

const timeSlots = generateTimeSlots();

function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function getCardTop(startTime: string) {
  const startMinutes = timeToMinutes(startTime);
  const gridStart = timeToMinutes("08:00");
  return ((startMinutes - gridStart) / 60) * 120;
}

function getCardHeight(startTime: string, endTime: string) {
  const diff = timeToMinutes(endTime) - timeToMinutes(startTime);
  return (diff / 60) * 120;
}

function getCurrentTimeTop() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const gridStart = timeToMinutes("08:00");
  return ((currentMinutes - gridStart) / 60) * 120;
}

function extractTime(isoString: string): string {
  const date = new Date(isoString);
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

const DAYS_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const SHORT_DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function formatDateHeader(date: Date): string {
  return `${DAYS_PT[date.getDay()]}, ${date.getDate()} de ${MONTHS_PT[date.getMonth()]}`;
}

function formatWeekHeader(date: Date): string {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} - ${end.getDate()} de ${MONTHS_PT[start.getMonth()]}`;
  }
  return `${start.getDate()} de ${MONTHS_PT[start.getMonth()].slice(0, 3)} - ${end.getDate()} de ${MONTHS_PT[end.getMonth()].slice(0, 3)}`;
}

function formatMonthHeader(date: Date): string {
  return `${MONTHS_PT[date.getMonth()]} ${date.getFullYear()}`;
}

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday start
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(date: Date): Date[] {
  const start = getWeekStart(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function getMonthDays(date: Date): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Pad start to Monday
  const startPad = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const days: Date[] = [];

  for (let i = startPad; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    days.push(d);
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }
  // Pad end to fill last week
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1];
    const d = new Date(last);
    d.setDate(d.getDate() + 1);
    days.push(d);
  }
  return days;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const statusConfig: Record<AppointmentStatus, { bg: string; border: string; label: string; dot: string }> = {
  pendente: { bg: "bg-blue-50 dark:bg-blue-900/30", border: "border-blue-500", label: "Pendente", dot: "bg-blue-500" },
  confirmado: { bg: "bg-amber-50 dark:bg-amber-900/30", border: "border-amber-500", label: "Confirmado", dot: "bg-amber-500" },
  concluido: { bg: "bg-emerald-50 dark:bg-emerald-900/30", border: "border-emerald-500", label: "Concluído", dot: "bg-emerald-500" },
  cancelado: { bg: "bg-surface-container-low", border: "border-muted-foreground", label: "Cancelado", dot: "bg-muted-foreground" },
  reagendado: { bg: "bg-purple-50 dark:bg-purple-900/30", border: "border-purple-400", label: "Reagendado", dot: "bg-purple-400" },
};

// ===== DRAGGABLE APPOINTMENT CARD (Day View) =====
function DraggableAppointmentCard({
  apt,
  startTime,
  endTime,
  onClick,
  getServiceNames,
}: {
  apt: AppointmentRow;
  startTime: string;
  endTime: string;
  onClick: () => void;
  getServiceNames: (apt: AppointmentRow) => string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: apt.id,
    data: { appointment: apt },
  });
  const config = statusConfig[apt.status];
  const clientName = apt.contacts?.name || "Cliente";
  const serviceName = getServiceNames(apt);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute left-2 right-2 cursor-pointer rounded-xl border-l-4 px-3 py-2 text-left transition-all hover:shadow-md",
        config.bg,
        config.border,
        apt.status === "cancelado" && "opacity-60",
        isDragging && "opacity-40 shadow-lg z-50"
      )}
      style={{
        top: getCardTop(startTime),
        height: getCardHeight(startTime, endTime),
      }}
    >
      <div className="flex items-start gap-1">
        <button
          className="mt-0.5 flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground/70 touch-none"
          {...listeners}
          {...attributes}
          data-testid="drag-handle"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button onClick={onClick} className="flex-1 text-left min-w-0">
          <p className="text-[10px] font-extrabold uppercase text-muted-foreground">
            {startTime} - {endTime}
          </p>
          <p className="text-xs font-bold text-foreground truncate">{clientName}</p>
          <p className="text-[11px] text-muted-foreground truncate">{serviceName}</p>
        </button>
      </div>
    </div>
  );
}

// ===== DROPPABLE TIME SLOT =====
function DroppableSlot({
  id,
  children,
  className,
  style,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(className, isOver && "bg-amber-50/50")}
      style={style}
    >
      {children}
    </div>
  );
}

// ===== MAIN COMPONENT =====
export default function AgendaPage() {
  const { tenant } = useTenantStore();
  const tenantId = tenant?.id;

  const supabase = useMemo(() => createClient(), []);

  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draggedAppointment, setDraggedAppointment] = useState<AppointmentRow | null>(null);

  // New appointment modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newAppt, setNewAppt] = useState({
    clientName: "",
    clientPhone: "",
    professionalId: "",
    serviceIds: [] as string[],
    date: "",
    time: "",
  });
  const [savingAppt, setSavingAppt] = useState(false);
  const [apptError, setApptError] = useState<string | null>(null);
  const [services, setServices] = useState<{ id: string; name: string; duration_min: number; price: number }[]>([]);

  // Filters
  const [filterProfId, setFilterProfId] = useState<string | null>(null);
  const [filterSvcId, setFilterSvcId] = useState<string | null>(null);
  const [filterProfOpen, setFilterProfOpen] = useState(false);
  const [filterSvcOpen, setFilterSvcOpen] = useState(false);
  const filterProfRef = useRef<HTMLDivElement>(null);
  const filterSvcRef = useRef<HTMLDivElement>(null);

  // Close filter dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterProfRef.current && !filterProfRef.current.contains(e.target as Node)) setFilterProfOpen(false);
      if (filterSvcRef.current && !filterSvcRef.current.contains(e.target as Node)) setFilterSvcOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtered appointments (professional + service filters)
  const filteredAppointments = useMemo(() => {
    return appointments.filter((apt) => {
      if (filterProfId && apt.professional_id !== filterProfId) return false;
      if (filterSvcId && !apt.appointment_services.some((as_) => as_.services?.id === filterSvcId)) return false;
      return true;
    });
  }, [appointments, filterProfId, filterSvcId]);

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Fetch professionals
  useEffect(() => {
    if (!tenantId) return;
    async function fetchProfessionals() {
      const { data } = await supabase
        .from("professionals")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("active", true);
      setProfessionals(data || []);
    }
    fetchProfessionals();
  }, [tenantId, supabase]);

  // Compute date range for fetching
  const dateRange = useMemo(() => {
    if (viewMode === "day") {
      const dateStr = toDateStr(selectedDate);
      return { start: `${dateStr}T00:00:00`, end: `${dateStr}T23:59:59` };
    }
    if (viewMode === "week") {
      const weekStart = getWeekStart(selectedDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return { start: `${toDateStr(weekStart)}T00:00:00`, end: `${toDateStr(weekEnd)}T23:59:59` };
    }
    if (viewMode === "month") {
      const monthDays = getMonthDays(selectedDate);
      const first = monthDays[0];
      const last = monthDays[monthDays.length - 1];
      return { start: `${toDateStr(first)}T00:00:00`, end: `${toDateStr(last)}T23:59:59` };
    }
    // list: from start of current month to +30 days from selectedDate (shows past overdue)
    const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const listEnd = new Date(selectedDate);
    listEnd.setDate(listEnd.getDate() + 29);
    return { start: `${toDateStr(monthStart)}T00:00:00`, end: `${toDateStr(listEnd)}T23:59:59` };
  }, [viewMode, selectedDate]);

  // Fetch appointments for date range
  const fetchAppointments = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await supabase
      .from("appointments")
      .select(
        "*, contacts(id, name, phone, avatar_url), professionals(id, name, avatar_url), appointment_services(services(id, name, duration_min, price))"
      )
      .eq("tenant_id", tenantId)
      .gte("start_at", dateRange.start)
      .lte("start_at", dateRange.end)
      .in("status", ["pendente", "confirmado", "concluido", "cancelado", "reagendado"]);
    setAppointments((data as AppointmentRow[]) || []);
    setLoading(false);
  }, [tenantId, dateRange, supabase]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Realtime subscription
  useRealtime({
    table: "appointments",
    filter: tenantId ? `tenant_id=eq.${tenantId}` : undefined,
    enabled: !!tenantId,
    onInsert: () => fetchAppointments(),
    onUpdate: () => fetchAppointments(),
    onDelete: () => fetchAppointments(),
  });

  // Fetch services for new appointment form
  useEffect(() => {
    if (!tenantId) return;
    async function fetchServices() {
      const { data } = await supabase
        .from("services")
        .select("id, name, duration_min, price")
        .eq("tenant_id", tenantId!)
        .eq("active", true)
        .order("name");
      setServices(data || []);
    }
    fetchServices();
  }, [tenantId, supabase]);

  // Create appointment handler
  async function handleCreateAppointment() {
    if (!tenantId) return;
    if (!newAppt.clientName.trim()) { setApptError("Nome do cliente obrigatório"); return; }
    if (!newAppt.clientPhone.trim()) { setApptError("Telefone obrigatório"); return; }
    if (!newAppt.professionalId) { setApptError("Selecione um profissional"); return; }
    if (newAppt.serviceIds.length === 0) { setApptError("Selecione pelo menos um serviço"); return; }
    if (!newAppt.date || !newAppt.time) { setApptError("Selecione data e horário"); return; }

    setSavingAppt(true);
    setApptError(null);

    try {
      const phone = newAppt.clientPhone.replace(/\D/g, "");

      // Upsert contact
      const { data: contact, error: contactErr } = await supabase
        .from("contacts")
        .upsert({ phone, name: newAppt.clientName, tenant_id: tenantId }, { onConflict: "tenant_id,phone" })
        .select("id")
        .single();
      if (contactErr) throw contactErr;

      // Get service details for duration calc
      const selectedServices = services.filter((s) => newAppt.serviceIds.includes(s.id));
      const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration_min, 0);
      const totalPrice = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);

      const startAt = new Date(`${newAppt.date}T${newAppt.time}:00`);
      const endAt = new Date(startAt.getTime() + totalDuration * 60000);

      // Create appointment
      const { data: appt, error: apptErr } = await supabase
        .from("appointments")
        .insert({
          tenant_id: tenantId,
          professional_id: newAppt.professionalId,
          contact_id: contact.id,
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          status: "pendente",
          total_price: totalPrice,
        })
        .select("id")
        .single();
      if (apptErr) throw apptErr;

      // Link services
      const apptServices = selectedServices.map((s) => ({
        appointment_id: appt.id,
        service_id: s.id,
        price_at_time: s.price,
        tenant_id: tenantId,
      }));
      await supabase.from("appointment_services").insert(apptServices);

      setShowNewModal(false);
      setNewAppt({ clientName: "", clientPhone: "", professionalId: "", serviceIds: [], date: "", time: "" });
      fetchAppointments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === "object" && err !== null && "message" in err ? String((err as {message:string}).message) : "Erro ao salvar";
      setApptError(msg);
    } finally {
      setSavingAppt(false);
    }
  }

  // Date navigation
  function goToPrevious() {
    setSelectedDate((prev) => {
      const d = new Date(prev);
      if (viewMode === "day") d.setDate(d.getDate() - 1);
      else if (viewMode === "list") d.setDate(d.getDate() - 7);
      else if (viewMode === "week") d.setDate(d.getDate() - 7);
      else if (viewMode === "month") d.setMonth(d.getMonth() - 1);
      return d;
    });
  }

  function goToNext() {
    setSelectedDate((prev) => {
      const d = new Date(prev);
      if (viewMode === "day") d.setDate(d.getDate() + 1);
      else if (viewMode === "list") d.setDate(d.getDate() + 7);
      else if (viewMode === "week") d.setDate(d.getDate() + 7);
      else if (viewMode === "month") d.setMonth(d.getMonth() + 1);
      return d;
    });
  }

  function goToToday() {
    setSelectedDate(new Date());
  }

  // Appointment actions
  async function updateStatus(appointmentId: string, status: AppointmentStatus) {
    const { error } = await supabase.from("appointments").update({ status }).eq("id", appointmentId).eq("tenant_id", tenantId!);
    if (error) { console.error("Erro ao atualizar status:", error); return; }
    fetchAppointments();
    closeDrawer();
  }

  function handleAppointmentClick(appointment: AppointmentRow) {
    setSelectedAppointment(appointment);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedAppointment(null);
  }

  // Drag and Drop handlers
  function handleDragStart(event: DragStartEvent) {
    const apt = event.active.data.current?.appointment as AppointmentRow | undefined;
    if (apt) setDraggedAppointment(apt);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDraggedAppointment(null);
    const { active, over } = event;
    if (!over) return;

    const apt = active.data.current?.appointment as AppointmentRow | undefined;
    if (!apt) return;

    // droppable id format: "slot-{professionalId}-{HH:MM}"
    const parts = (over.id as string).split("-");
    if (parts[0] !== "slot" || parts.length < 3) return;

    // Parse the drop target using pipe-delimited format: "slot|{professionalId}|{HH:MM}"
    const dropId = over.id as string;
    const match = dropId.match(/^slot\|(.+)\|(\d{2}:\d{2})$/);
    if (!match) return;

    const targetProfId = match[1];
    const targetTime = match[2];

    // Calculate duration
    const oldStart = new Date(apt.start_at);
    const oldEnd = new Date(apt.end_at);
    const durationMs = oldEnd.getTime() - oldStart.getTime();

    // Build new start/end
    const [newH, newM] = targetTime.split(":").map(Number);
    const newStart = new Date(selectedDate);
    newStart.setHours(newH, newM, 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMs);

    const { error } = await supabase
      .from("appointments")
      .update({
        professional_id: targetProfId,
        start_at: newStart.toISOString(),
        end_at: newEnd.toISOString(),
      })
      .eq("id", apt.id)
      .eq("tenant_id", tenantId!);
    if (error) { console.error("Erro ao reagendar:", error); return; }

    fetchAppointments();
  }

  // Computed
  const gridHeight = timeSlots.length * 120;

  function getAppointmentValue(apt: AppointmentRow): number {
    if (!apt.appointment_services || apt.appointment_services.length === 0) return 0;
    return apt.appointment_services.reduce((sum, as_) => sum + (as_.services?.price || 0), 0);
  }

  function getServiceNames(apt: AppointmentRow): string {
    if (!apt.appointment_services || apt.appointment_services.length === 0) return "\u2014";
    return apt.appointment_services.map((as_) => as_.services?.name).filter(Boolean).join(", ");
  }

  function getInitials(name: string): string {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  // Header text based on view
  function getHeaderText(): string {
    if (viewMode === "day") return formatDateHeader(selectedDate);
    if (viewMode === "list") {
      const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      const listEnd = new Date(selectedDate);
      listEnd.setDate(listEnd.getDate() + 29);
      const startStr = `${monthStart.getDate().toString().padStart(2, "0")}/${(monthStart.getMonth() + 1).toString().padStart(2, "0")}`;
      const endStr = `${listEnd.getDate()}/${(listEnd.getMonth() + 1).toString().padStart(2, "0")}`;
      return `${startStr} — ${endStr}`;
    }
    if (viewMode === "week") return formatWeekHeader(selectedDate);
    return formatMonthHeader(selectedDate);
  }

  // View toggle buttons config
  const viewButtons: { mode: ViewMode; label: string; icon: typeof Calendar }[] = [
    { mode: "day", label: "Dia", icon: CalendarDays },
    { mode: "week", label: "Semana", icon: CalendarRange },
    { mode: "month", label: "Mês", icon: Calendar },
    { mode: "list", label: "Lista", icon: List },
  ];

  // ===== WEEK VIEW =====
  function renderWeekView() {
    const weekDays = getWeekDays(selectedDate);
    const today = new Date();

    return (
      <div data-testid="week-view" className="relative flex flex-1 overflow-auto rounded-2xl border border-border bg-surface-container-lowest shadow-sm">
        <div className="flex min-w-fit flex-1">
          {/* Time Column */}
          <div className="sticky left-0 z-20 w-[60px] flex-shrink-0 border-r border-border/50 bg-surface-container-lowest">
            <div className="h-[52px] border-b border-border/50" />
            <div className="relative" style={{ height: gridHeight }}>
              {timeSlots.map((time, i) => (
                <div
                  key={time}
                  className="absolute right-2 text-[10px] font-bold text-muted-foreground"
                  style={{ top: i * 120 - 6 }}
                >
                  {time}
                </div>
              ))}
            </div>
          </div>

          {/* Day Columns */}
          {weekDays.map((day, dayIdx) => {
            const dayStr = toDateStr(day);
            const isToday = isSameDay(day, today);
            const dayAppointments = filteredAppointments.filter((apt) => {
              const aptDate = new Date(apt.start_at);
              return isSameDay(aptDate, day);
            });

            return (
              <div
                key={dayStr}
                data-testid="week-day-column"
                className={cn(
                  "min-w-[160px] flex-1 border-r border-border/50 last:border-r-0",
                  isToday && "bg-amber-50/20"
                )}
              >
                {/* Day Header */}
                <div className="sticky top-0 z-10 border-b border-border/50 bg-surface-container-lowest/95 backdrop-blur-sm px-2 py-2 text-center">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                    {SHORT_DAYS_PT[(dayIdx + 1) % 7]}
                  </p>
                  <p
                    className={cn(
                      "text-lg font-bold",
                      isToday ? "text-amber-600" : "text-foreground"
                    )}
                  >
                    {day.getDate()}
                  </p>
                </div>

                {/* Time Grid */}
                <div className="relative" style={{ height: gridHeight }}>
                  {timeSlots.map((_, i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0 border-t border-border/30"
                      style={{ top: i * 120 }}
                    />
                  ))}

                  {/* Appointments */}
                  {dayAppointments.map((apt) => {
                    const startTime = extractTime(apt.start_at);
                    const endTime = extractTime(apt.end_at);
                    const config = statusConfig[apt.status];
                    const clientName = apt.contacts?.name || "Cliente";
                    return (
                      <button
                        key={apt.id}
                        onClick={() => handleAppointmentClick(apt)}
                        className={cn(
                          "absolute left-1 right-1 cursor-pointer rounded-lg border-l-3 px-1.5 py-1 text-left transition-all hover:shadow-md",
                          config.bg,
                          config.border,
                          apt.status === "cancelado" && "opacity-60"
                        )}
                        style={{
                          top: getCardTop(startTime),
                          height: Math.max(getCardHeight(startTime, endTime), 24),
                        }}
                      >
                        <p className="text-[9px] font-bold text-muted-foreground truncate">
                          {startTime} {clientName}
                        </p>
                      </button>
                    );
                  })}

                  {/* Current time line for today */}
                  {isToday && (
                    <div
                      className="absolute left-0 right-0 z-10 flex items-center"
                      style={{ top: getCurrentTimeTop() }}
                    >
                      <div className="h-2 w-2 rounded-full bg-amber-500" />
                      <div className="h-0.5 flex-1 bg-amber-500" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ===== MONTH VIEW =====
  function renderMonthView() {
    const monthDays = getMonthDays(selectedDate);
    const today = new Date();
    const currentMonth = selectedDate.getMonth();

    return (
      <div data-testid="month-view" className="flex flex-1 flex-col overflow-auto rounded-2xl border border-border bg-surface-container-lowest shadow-sm">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border/50">
          {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
            <div key={d} className="py-2 text-center text-[11px] font-bold text-muted-foreground uppercase">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div data-testid="month-grid" className="grid flex-1 grid-cols-7">
          {monthDays.map((day, idx) => {
            const dayStr = toDateStr(day);
            const isToday = isSameDay(day, today);
            const isCurrentMonth = day.getMonth() === currentMonth;
            const dayAppointments = filteredAppointments.filter((apt) => {
              const aptDate = new Date(apt.start_at);
              return isSameDay(aptDate, day);
            });
            const count = dayAppointments.length;

            return (
              <button
                key={dayStr + idx}
                data-testid="month-day-cell"
                onClick={() => {
                  setSelectedDate(new Date(day));
                  setViewMode("day");
                }}
                className={cn(
                  "flex min-h-[80px] flex-col items-start border-b border-r border-border/30 p-2 text-left transition-colors hover:bg-surface-container-low",
                  !isCurrentMonth && "opacity-40"
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold",
                    isToday
                      ? "bg-amber-500 text-white"
                      : "text-foreground"
                  )}
                >
                  {day.getDate()}
                </span>
                {count > 0 && (
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {count <= 3 ? (
                      dayAppointments.slice(0, 3).map((apt) => (
                        <div
                          key={apt.id}
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            statusConfig[apt.status].dot
                          )}
                        />
                      ))
                    ) : (
                      <span className="text-[10px] font-bold text-amber-600">
                        {count} agend.
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ===== LIST VIEW =====
  function renderListView() {
    const sortedAppointments = [...filteredAppointments].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );

    // Group by date
    const groups: { dateKey: string; label: string; items: AppointmentRow[] }[] = [];
    for (const apt of sortedAppointments) {
      const d = new Date(apt.start_at);
      const dateKey = toDateStr(d);
      const isToday = isSameDay(d, new Date());
      const label = isToday
        ? `Hoje — ${formatDateHeader(d)}`
        : formatDateHeader(d);
      const existing = groups.find((g) => g.dateKey === dateKey);
      if (existing) {
        existing.items.push(apt);
      } else {
        groups.push({ dateKey, label, items: [apt] });
      }
    }

    return (
      <div data-testid="list-view" className="flex flex-1 flex-col overflow-auto rounded-2xl border border-border bg-surface-container-lowest shadow-sm">
        {/* Table Header */}
        <div className="sticky top-0 z-10 grid grid-cols-[90px_1fr_1fr_1fr_120px] gap-2 border-b border-border bg-surface-container-lowest/95 backdrop-blur-sm px-4 py-3">
          <span className="text-[11px] font-bold text-muted-foreground uppercase">Horário</span>
          <span className="text-[11px] font-bold text-muted-foreground uppercase">Cliente</span>
          <span className="text-[11px] font-bold text-muted-foreground uppercase">Serviço</span>
          <span className="text-[11px] font-bold text-muted-foreground uppercase">Profissional</span>
          <span className="text-[11px] font-bold text-muted-foreground uppercase">Status</span>
        </div>

        {/* Rows */}
        {groups.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Nenhum agendamento nos próximos 30 dias</p>
          </div>
        ) : (
          <div>
            {groups.map((group) => (
              <div key={group.dateKey}>
                {/* Date separator */}
                <div className="sticky top-[45px] z-[5] border-b border-border/50 bg-surface-container-low/80 px-4 py-2 backdrop-blur-sm">
                  <span className="text-xs font-bold text-foreground/60">{group.label}</span>
                </div>
                <div className="divide-y divide-border/20">
                  {group.items.map((apt) => {
                    const startTime = extractTime(apt.start_at);
                    const endTime = extractTime(apt.end_at);
                    const config = statusConfig[apt.status] ?? { dot: "bg-gray-400", label: apt.status };
                    const clientName = apt.contacts?.name || "Cliente";
                    const profName = apt.professionals?.name || "—";
                    const serviceName = getServiceNames(apt);

                    return (
                      <button
                        key={apt.id}
                        data-testid="list-row"
                        onClick={() => handleAppointmentClick(apt)}
                        className="grid w-full grid-cols-[90px_1fr_1fr_1fr_120px] gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-container-low"
                      >
                        <span className="text-sm font-bold text-foreground">
                          {startTime}<span className="font-normal text-muted-foreground text-xs"> - {endTime}</span>
                        </span>
                        <span className="text-sm text-foreground truncate">{clientName}</span>
                        <span className="text-sm text-foreground/70 truncate">{serviceName}</span>
                        <span className="text-sm text-foreground/70 truncate">{profName}</span>
                        <div className="flex items-center gap-1.5">
                          <div className={cn("h-2 w-2 rounded-full shrink-0", config.dot)} />
                          <span className="text-xs font-semibold text-foreground/70">{config.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ===== DAY VIEW (with DnD) =====
  function renderDayView() {
    return (
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div data-testid="day-view" className="relative flex flex-1 overflow-auto rounded-2xl border border-border bg-surface-container-lowest shadow-sm">
          <div className="flex min-w-fit flex-1">
            {/* Time Column */}
            <div className="sticky left-0 z-20 w-[80px] flex-shrink-0 border-r border-border/50 bg-surface-container-lowest">
              <div className="h-[88px] border-b border-border/50" />
              <div className="relative" style={{ height: gridHeight }}>
                {timeSlots.map((time, i) => (
                  <div
                    key={time}
                    className="absolute right-3 text-[11px] font-bold text-muted-foreground"
                    style={{ top: i * 120 - 6 }}
                  >
                    {time}
                  </div>
                ))}
              </div>
            </div>

            {/* Professional Columns */}
            {professionals.map((prof) => (
              <div key={prof.id} className="min-w-[280px] flex-1 border-r border-border/50 last:border-r-0">
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/50 bg-surface-container-lowest/95 backdrop-blur-sm px-4 py-4">
                  <div className="relative">
                    {prof.avatar_url ? (
                      <img
                        src={prof.avatar_url}
                        alt={prof.name}
                        className="h-12 w-12 rounded-2xl object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-surface-container to-surface-container-high text-sm font-bold text-foreground/70">
                        {getInitials(prof.name)}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{prof.name}</p>
                    {prof.role && <p className="text-[11px] text-muted-foreground">{prof.role}</p>}
                  </div>
                </div>

                {/* Slots with Droppable zones */}
                <div className="relative" style={{ height: gridHeight }}>
                  {/* Droppable half-hour zones */}
                  {timeSlots.map((time, i) => {
                    const [h] = time.split(":").map(Number);
                    const slot1 = `${h.toString().padStart(2, "0")}:00`;
                    const slot2 = `${h.toString().padStart(2, "0")}:30`;
                    return (
                      <div key={time}>
                        <DroppableSlot
                          id={`slot|${prof.id}|${slot1}`}
                          className="absolute left-0 right-0"
                          style={{ top: i * 120, height: 60 }}
                        >
                          <div className="h-full border-t border-border/30" />
                        </DroppableSlot>
                        <DroppableSlot
                          id={`slot|${prof.id}|${slot2}`}
                          className="absolute left-0 right-0"
                          style={{ top: i * 120 + 60, height: 60 }}
                        >
                          <div className="h-full border-t border-dashed border-border/30" />
                        </DroppableSlot>
                      </div>
                    );
                  })}

                  {/* Appointments */}
                  {filteredAppointments
                    .filter((apt) => apt.professional_id === prof.id)
                    .map((apt) => {
                      const startTime = extractTime(apt.start_at);
                      const endTime = extractTime(apt.end_at);
                      return (
                        <DraggableAppointmentCard
                          key={apt.id}
                          apt={apt}
                          startTime={startTime}
                          endTime={endTime}
                          onClick={() => handleAppointmentClick(apt)}
                          getServiceNames={getServiceNames}
                        />
                      );
                    })}

                  {/* Current Time Line */}
                  <div
                    className="absolute left-0 right-0 z-10 flex items-center pointer-events-none"
                    style={{ top: getCurrentTimeTop() }}
                  >
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                    <div className="h-0.5 flex-1 bg-amber-500" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Floating Legend */}
          <div className="absolute bottom-4 right-4 z-30 rounded-2xl bg-surface-container-lowest/90 p-4 shadow-2xl backdrop-blur">
            <div className="flex flex-col gap-2">
              {(["pendente", "confirmado", "concluido"] as AppointmentStatus[]).map((status) => {
                const config = statusConfig[status];
                return (
                  <div key={status} className="flex items-center gap-2">
                    <div className={cn("h-2.5 w-2.5 rounded-full", config.dot)} />
                    <span className="text-[11px] font-medium text-foreground/70">{config.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {draggedAppointment ? (
            <div
              className={cn(
                "w-[260px] rounded-xl border-l-4 px-3 py-2 shadow-xl",
                statusConfig[draggedAppointment.status].bg,
                statusConfig[draggedAppointment.status].border
              )}
            >
              <p className="text-[10px] font-extrabold uppercase text-muted-foreground">
                {extractTime(draggedAppointment.start_at)} - {extractTime(draggedAppointment.end_at)}
              </p>
              <p className="text-xs font-bold text-foreground truncate">
                {draggedAppointment.contacts?.name || "Cliente"}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {getServiceNames(draggedAppointment)}
              </p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    );
  }

  if (!tenantId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!loading && professionals.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Adicione profissionais primeiro</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* TOP BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Date Navigator */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevious}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container text-foreground/70 hover:bg-surface-container-high transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goToToday}
            className="rounded-full bg-surface-container px-4 py-1.5 text-xs font-semibold text-foreground/70 hover:bg-surface-container-high transition-colors"
          >
            Hoje
          </button>
          <button
            onClick={goToNext}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container text-foreground/70 hover:bg-surface-container-high transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-sm font-bold text-foreground">{getHeaderText()}</span>
        </div>

        {/* Center: View Toggle */}
        <div data-testid="view-toggle" className="flex items-center rounded-full bg-surface-container p-0.5">
          {viewButtons.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              data-testid={`view-btn-${mode}`}
              onClick={() => setViewMode(mode)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                viewMode === mode
                  ? "bg-surface-container-lowest text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground/80"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Professional filter */}
          <div className="relative" ref={filterProfRef}>
            <button
              onClick={() => { setFilterProfOpen((o) => !o); setFilterSvcOpen(false); }}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                filterProfId
                  ? "bg-primary text-white"
                  : "bg-surface-container text-foreground/70 hover:bg-surface-container-high"
              )}
            >
              <User className="h-3.5 w-3.5" />
              {filterProfId ? (professionals.find((p) => p.id === filterProfId)?.name?.split(" ")[0] ?? "Profissional") : "Profissional"}
            </button>
            {filterProfOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-border bg-white shadow-lg py-1">
                <button
                  onClick={() => { setFilterProfId(null); setFilterProfOpen(false); }}
                  className={cn("w-full px-3 py-2 text-left text-xs hover:bg-surface-container", !filterProfId && "font-bold text-primary")}
                >
                  Todos
                </button>
                {professionals.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setFilterProfId(p.id); setFilterProfOpen(false); }}
                    className={cn("w-full px-3 py-2 text-left text-xs hover:bg-surface-container", filterProfId === p.id && "font-bold text-primary")}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Service filter */}
          <div className="relative" ref={filterSvcRef}>
            <button
              onClick={() => { setFilterSvcOpen((o) => !o); setFilterProfOpen(false); }}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                filterSvcId
                  ? "bg-primary text-white"
                  : "bg-surface-container text-foreground/70 hover:bg-surface-container-high"
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              {filterSvcId ? (services.find((s) => s.id === filterSvcId)?.name ?? "Serviço") : "Serviço"}
            </button>
            {filterSvcOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-border bg-white shadow-lg py-1">
                <button
                  onClick={() => { setFilterSvcId(null); setFilterSvcOpen(false); }}
                  className={cn("w-full px-3 py-2 text-left text-xs hover:bg-surface-container", !filterSvcId && "font-bold text-primary")}
                >
                  Todos
                </button>
                {services.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setFilterSvcId(s.id); setFilterSvcOpen(false); }}
                    className={cn("w-full px-3 py-2 text-left text-xs hover:bg-surface-container", filterSvcId === s.id && "font-bold text-primary")}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => { setShowNewModal(true); setApptError(null); setNewAppt({ clientName: "", clientPhone: "", professionalId: "", serviceIds: [], date: toDateStr(selectedDate), time: "09:00" }); }} className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" />
            Novo agendamento
          </button>
        </div>
      </div>

      {/* VIEW CONTENT */}
      {viewMode === "day" && renderDayView()}
      {viewMode === "week" && renderWeekView()}
      {viewMode === "month" && renderMonthView()}
      {viewMode === "list" && renderListView()}

      {/* NEW APPOINTMENT MODAL */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowNewModal(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-surface-container-lowest p-6 shadow-xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-foreground">Novo Agendamento</h2>
              <button onClick={() => setShowNewModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-4">
              {apptError && <p className="text-sm text-red-500">{apptError}</p>}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome do cliente</label>
                  <input type="text" value={newAppt.clientName} onChange={(e) => setNewAppt({ ...newAppt, clientName: e.target.value })} placeholder="Nome completo" className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-amber-400" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Telefone</label>
                  <input type="tel" value={newAppt.clientPhone} onChange={(e) => setNewAppt({ ...newAppt, clientPhone: maskPhone(e.target.value) })} placeholder="+55 (11) 99999-0000" className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-amber-400" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Profissional</label>
                <select value={newAppt.professionalId} onChange={(e) => setNewAppt({ ...newAppt, professionalId: e.target.value })} className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-amber-400">
                  <option value="">Selecione...</option>
                  {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Serviços</label>
                <div className="max-h-32 overflow-y-auto space-y-1 rounded-xl border border-border p-2">
                  {services.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 cursor-pointer text-sm">
                      <input type="checkbox" checked={newAppt.serviceIds.includes(s.id)} onChange={(e) => {
                        if (e.target.checked) setNewAppt({ ...newAppt, serviceIds: [...newAppt.serviceIds, s.id] });
                        else setNewAppt({ ...newAppt, serviceIds: newAppt.serviceIds.filter((id) => id !== s.id) });
                      }} className="rounded" />
                      <span className="flex-1">{s.name}</span>
                      <span className="text-xs text-muted-foreground">{s.duration_min}min</span>
                    </label>
                  ))}
                  {services.length === 0 && <p className="text-xs text-muted-foreground py-2 text-center">Nenhum serviço cadastrado</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Data</label>
                  <input type="date" value={newAppt.date} onChange={(e) => setNewAppt({ ...newAppt, date: e.target.value })} className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-amber-400" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Horário</label>
                  <input type="time" value={newAppt.time} onChange={(e) => setNewAppt({ ...newAppt, time: e.target.value })} className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-amber-400" />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowNewModal(false)} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">Cancelar</button>
              <button onClick={handleCreateAppointment} disabled={savingAppt} className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2">
                {savingAppt && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                Agendar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* APPOINTMENT DRAWER */}
      {drawerOpen && selectedAppointment && (() => {
        const apt = selectedAppointment;
        const startTime = extractTime(apt.start_at);
        const endTime = extractTime(apt.end_at);
        const clientName = apt.contacts?.name || "Cliente";
        const serviceName = getServiceNames(apt);
        const value = getAppointmentValue(apt);
        const aptDate = new Date(apt.start_at);
        const dateDisplay = `${aptDate.getDate()} de ${MONTHS_PT[aptDate.getMonth()]}, ${aptDate.getFullYear()}`;

        return (
          <div className="fixed inset-y-0 right-0 z-50 flex">
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={closeDrawer} />
            {/* Panel */}
            <div className="relative ml-auto flex h-full w-[320px] flex-col bg-surface-container-lowest shadow-2xl">
              {/* Close */}
              <button
                onClick={closeDrawer}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-surface-container text-muted-foreground hover:bg-surface-container-high transition-colors"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Client Info */}
              <div className="flex flex-col items-center border-b border-border/50 px-6 pb-6 pt-8">
                {apt.contacts?.avatar_url ? (
                  <img
                    src={apt.contacts.avatar_url}
                    alt={clientName}
                    className="mb-3 h-24 w-24 rounded-3xl object-cover"
                  />
                ) : (
                  <div className="mb-3 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-surface-container-high to-surface-container text-2xl font-bold text-muted-foreground">
                    {getInitials(clientName)}
                  </div>
                )}
                <p className="text-lg font-bold text-foreground">{clientName}</p>
                {apt.contacts?.phone && (
                  <p className="mt-1 text-xs text-muted-foreground">{apt.contacts.phone}</p>
                )}
              </div>

              {/* Details */}
              <div className="flex-1 overflow-auto px-6 py-5">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-container">
                      <Scissors className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Serviço</p>
                      <p className="text-sm font-semibold text-foreground">{serviceName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-container">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Data</p>
                      <p className="text-sm font-semibold text-foreground">{dateDisplay}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-container">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Horário</p>
                      <p className="text-sm font-semibold text-foreground">
                        {startTime} - {endTime}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-container">
                      <span className="text-sm font-bold text-muted-foreground">R$</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Valor</p>
                      <p className="text-sm font-semibold text-foreground">
                        R$ {value.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div className="mt-6">
                  <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">Status</p>
                  <div
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full px-3 py-1.5",
                      statusConfig[apt.status].bg
                    )}
                  >
                    <div className={cn("h-2 w-2 rounded-full", statusConfig[apt.status].dot)} />
                    <span className="text-xs font-bold text-foreground/80">
                      {statusConfig[apt.status].label}
                    </span>
                  </div>
                </div>

                {/* Cancel reason */}
                {apt.status === "cancelado" && apt.cancel_reason && (
                  <div className="mt-4 rounded-xl bg-red-50 p-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase text-red-400">Motivo do cancelamento</p>
                    <p className="text-sm text-red-700">{apt.cancel_reason}</p>
                  </div>
                )}

                {/* Satisfaction rating */}
                {apt.rating != null && (
                  <div className="mt-4 rounded-xl bg-amber-50 p-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase text-amber-500">Avaliação do cliente</p>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <span key={s} className={s <= apt.rating! ? "text-amber-400" : "text-gray-200"}>★</span>
                      ))}
                      <span className="ml-2 text-sm font-medium text-amber-700">{apt.rating}/5</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="border-t border-border/50 px-6 py-4">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => updateStatus(apt.id, "confirmado")}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2.5 text-[11px] font-bold text-white hover:bg-emerald-600 transition-colors"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Confirmar
                  </button>
                  <button className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-500 px-3 py-2.5 text-[11px] font-bold text-white hover:bg-blue-600 transition-colors">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reagendar
                  </button>
                  <button
                    onClick={() => updateStatus(apt.id, "cancelado")}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-red-500 px-3 py-2.5 text-[11px] font-bold text-white hover:bg-red-600 transition-colors"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Cancelar
                  </button>
                  <button
                    onClick={() => updateStatus(apt.id, "concluido")}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-foreground/80 px-3 py-2.5 text-[11px] font-bold text-background hover:bg-foreground/90 transition-colors"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Concluir
                  </button>
                </div>
                {apt.contacts?.phone && (
                  <a
                    href={`https://wa.me/${apt.contacts.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-3 py-2.5 text-[11px] font-bold text-white hover:bg-green-600 transition-colors"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
