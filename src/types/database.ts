export type TenantPlan = "trial" | "essencial" | "ia";
export type UserRole = "owner" | "admin" | "professional" | "receptionist";
export type SubscriptionStatus = "trial" | "active" | "past_due" | "canceled" | "expired" | "pending_payment";
export type AppointmentStatus = "pendente" | "confirmado" | "concluido" | "cancelado" | "reagendado" | "no_show";
export type ContactStatus = "respondido" | "pendente" | "follow_up" | "agendado" | "bloqueado";
export type MessageDirection = "in" | "out";
export type MessageSender = "system" | "ia" | "human";
export type WhatsAppSessionStatus = "connected" | "disconnected" | "qr_pending";
export type IATone = "formal" | "humorado" | "educado" | "simpatico";
export type PaymentMethod = "PIX" | "BOLETO" | "CREDIT_CARD";
export type CreatedVia = "whatsapp" | "painel" | "ia";

export interface Tenant {
  id: string;
  name: string;
  cnpj?: string;
  public_slug?: string;
  plan: TenantPlan;
  trial_ends_at?: string;
  created_at: string;
}

export interface User {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  onboarding_completed: boolean;
  created_at: string;
}

export interface Company {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  phone?: string;
  email?: string;
  address?: {
    cep?: string;
    rua?: string;
    numero?: string;
    bairro?: string;
    cidade?: string;
    estado?: string;
    lat?: number;
    lng?: number;
  };
  logo_url?: string;
  public_slug?: string;
  is_default: boolean;
  created_at: string;
}

export interface Professional {
  id: string;
  tenant_id: string;
  company_id: string;
  user_id?: string;
  name: string;
  phone?: string;
  email?: string;
  bio?: string;
  avatar_url?: string;
  commission_pct: number;
  monthly_goal?: number;
  active: boolean;
  created_at: string;
}

export interface ProfessionalSchedule {
  id: string;
  professional_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  break_start?: string;
  break_end?: string;
}

export interface ServiceCategory {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  color?: string;
}

export interface Service {
  id: string;
  tenant_id: string;
  category_id?: string;
  name: string;
  description?: string;
  duration_min: number;
  price: number;
  promo_active: boolean;
  promo_discount_pct?: number;
  active: boolean;
  created_at: string;
}

export interface Contact {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  avatar_url?: string;
  birthday?: string;
  status: ContactStatus;
  ia_enabled: boolean;
  tags?: string[];
  notes?: string;
  last_message_at?: string;
  last_appointment_at?: string;
  ltv: number;
  source?: string;
  created_at: string;
}

export interface Appointment {
  id: string;
  tenant_id: string;
  company_id?: string;
  contact_id: string;
  professional_id: string;
  start_at: string;
  end_at: string;
  status: AppointmentStatus;
  total_price: number;
  notes?: string;
  coupon_id?: string;
  created_via?: CreatedVia;
  created_at: string;
  // Joined
  contact?: Contact;
  professional?: Professional;
  services?: Service[];
}

export interface Message {
  id: string;
  tenant_id: string;
  contact_id: string;
  direction: MessageDirection;
  content?: string;
  media_url?: string;
  media_type?: string;
  sent_by?: MessageSender;
  status?: string;
  created_at: string;
}

export interface WhatsAppSession {
  id: string;
  tenant_id: string;
  instance_id?: string;
  instance_token?: string;
  phone_number?: string;
  status: WhatsAppSessionStatus;
  webhook_configured_at?: string;
  webhook_status?: string;
  last_seen_at?: string;
  created_at: string;
}

export interface Subscription {
  id: string;
  tenant_id: string;
  plan_id?: string;
  status: SubscriptionStatus;
  trial_ends_at?: string;
  current_period_start?: string;
  current_period_end?: string;
  next_charge_at?: string;
  asaas_customer_id?: string;
  asaas_subscription_id?: string;
  payment_method?: PaymentMethod;
  auto_renew: boolean;
  canceled_at?: string;
  cancellation_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  name: string;
  tier: "essencial" | "ia";
  billing_type: "one_time" | "recurrent" | "semiannual" | "annual";
  price_monthly: number;
  total_value: number;
  cycle_months: number;
  has_ia: boolean;
  active: boolean;
}
