-- ============ EXTENSIONS ============
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ============ CORE ============
CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cnpj text,
  public_slug text UNIQUE,
  plan text CHECK (plan IN ('trial','essencial','ia')) DEFAULT 'trial',
  trial_ends_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text,
  role text CHECK (role IN ('owner','admin','professional','receptionist')) DEFAULT 'owner',
  onboarding_completed bool DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ============ BILLING ============
CREATE TABLE plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  tier text CHECK (tier IN ('essencial','ia')) NOT NULL,
  billing_type text CHECK (billing_type IN ('one_time','recurrent','semiannual','annual')) NOT NULL,
  price_monthly numeric(10,2) NOT NULL,
  total_value numeric(10,2) NOT NULL,
  cycle_months int NOT NULL,
  has_ia bool DEFAULT false,
  active bool DEFAULT true
);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id text REFERENCES plans(id),
  status text CHECK (status IN ('trial','active','past_due','canceled','expired','pending_payment')) DEFAULT 'trial',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_charge_at timestamptz,
  asaas_customer_id text,
  asaas_subscription_id text,
  payment_method text CHECK (payment_method IN ('PIX','BOLETO','CREDIT_CARD')),
  auto_renew bool DEFAULT true,
  canceled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES subscriptions(id),
  asaas_payment_id text UNIQUE,
  type text CHECK (type IN ('subscription','tokens_addon','upgrade')),
  description text,
  value numeric(10,2) NOT NULL,
  net_value numeric(10,2),
  status text CHECK (status IN ('PENDING','CONFIRMED','RECEIVED','OVERDUE','REFUNDED','DELETED','FAILED')) DEFAULT 'PENDING',
  billing_type text CHECK (billing_type IN ('PIX','BOLETO','CREDIT_CARD')),
  installment_count int,
  due_date date,
  paid_at timestamptz,
  invoice_url text,
  bank_slip_url text,
  pix_qr_code text,
  pix_copy_paste text,
  period_start date,
  period_end date,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE token_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES subscriptions(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  tokens_input bigint DEFAULT 0,
  tokens_output bigint DEFAULT 0,
  estimated_cost numeric(10,2) DEFAULT 0,
  billed bool DEFAULT false,
  invoice_id uuid REFERENCES invoices(id),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE asaas_webhook_events (
  id text PRIMARY KEY,
  event text NOT NULL,
  payload jsonb,
  processed bool DEFAULT false,
  processed_at timestamptz,
  received_at timestamptz DEFAULT now()
);

-- ============ EMPRESA ============
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  phone text,
  email text,
  address jsonb,
  logo_url text,
  public_slug text UNIQUE,
  is_default bool DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  weekday int CHECK (weekday BETWEEN 0 AND 6) NOT NULL,
  open_time time NOT NULL,
  close_time time NOT NULL,
  break_start time,
  break_end time,
  closed bool DEFAULT false
);

CREATE TABLE holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  date date NOT NULL,
  name text NOT NULL
);

-- ============ PROFISSIONAIS & SERVIÇOS ============
CREATE TABLE professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  name text NOT NULL,
  phone text,
  email text,
  bio text,
  avatar_url text,
  commission_pct numeric(5,2) DEFAULT 0,
  monthly_goal numeric(10,2),
  active bool DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE professional_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid REFERENCES professionals(id) ON DELETE CASCADE,
  weekday int CHECK (weekday BETWEEN 0 AND 6) NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_start time,
  break_end time
);

CREATE TABLE professional_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid REFERENCES professionals(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text
);

CREATE TABLE service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text
);

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  category_id uuid REFERENCES service_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  duration_min int NOT NULL DEFAULT 30,
  price numeric(10,2) NOT NULL DEFAULT 0,
  promo_active bool DEFAULT false,
  promo_discount_pct numeric(5,2),
  active bool DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE professional_services (
  professional_id uuid REFERENCES professionals(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (professional_id, service_id)
);

-- ============ CLIENTES & AGENDAMENTOS ============
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  avatar_url text,
  birthday date,
  status text CHECK (status IN ('respondido','pendente','follow_up','agendado','bloqueado')) DEFAULT 'pendente',
  ia_enabled bool DEFAULT true,
  tags text[],
  notes text,
  last_message_at timestamptz,
  last_appointment_at timestamptz,
  ltv numeric(10,2) DEFAULT 0,
  source text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, phone)
);

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id),
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES professionals(id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text CHECK (status IN ('pendente','confirmado','concluido','cancelado','reagendado','no_show')) DEFAULT 'pendente',
  total_price numeric(10,2) DEFAULT 0,
  notes text,
  coupon_id uuid,
  created_via text CHECK (created_via IN ('whatsapp','painel','ia')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE appointment_services (
  appointment_id uuid REFERENCES appointments(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id),
  price_at_time numeric(10,2) NOT NULL,
  PRIMARY KEY (appointment_id, service_id)
);

CREATE TABLE appointment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES appointments(id) ON DELETE CASCADE,
  action text CHECK (action IN ('created','rescheduled','canceled','confirmed','completed','no_show','updated')) NOT NULL,
  previous_state jsonb,
  new_state jsonb,
  reason text,
  performed_by text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id),
  professional_id uuid REFERENCES professionals(id),
  desired_date date,
  notified bool DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ============ COMUNICAÇÃO ============
CREATE TABLE whatsapp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id text,
  instance_token text,
  phone_number text,
  status text CHECK (status IN ('connected','disconnected','qr_pending')) DEFAULT 'disconnected',
  webhook_configured_at timestamptz,
  webhook_status text,
  last_seen_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  direction text CHECK (direction IN ('in','out')) NOT NULL,
  content text,
  media_url text,
  media_type text,
  sent_by text CHECK (sent_by IN ('system','ia','human')),
  status text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE conversation_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  current_state text NOT NULL DEFAULT 'IDLE',
  context jsonb DEFAULT '{}',
  last_interaction_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, contact_id)
);

-- ============ CONFIGURAÇÕES ============
CREATE TABLE settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  welcome_message text,
  birthday_message text,
  birthday_send_time time DEFAULT '09:00',
  birthday_enabled bool DEFAULT false,
  pix_key text,
  payment_link text
);

CREATE TABLE followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  order_num int CHECK (order_num BETWEEN 1 AND 3) NOT NULL,
  delay_hours int NOT NULL DEFAULT 24,
  message text,
  enabled bool DEFAULT true
);

CREATE TABLE coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  base_name text NOT NULL,
  discount_pct numeric(5,2) NOT NULL,
  duration_days int NOT NULL DEFAULT 7,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE coupon_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid REFERENCES coupons(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id),
  code text UNIQUE NOT NULL,
  used bool DEFAULT false,
  used_at timestamptz,
  expires_at timestamptz
);

-- ============ IA ============
CREATE TABLE ia_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled bool DEFAULT false,
  tone text CHECK (tone IN ('formal','humorado','educado','simpatico')) DEFAULT 'simpatico',
  instructions text,
  knowledge_base_url text,
  test_mode bool DEFAULT false,
  test_numbers text[],
  handoff_keywords text[]
);

CREATE TABLE ia_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  tokens_input int DEFAULT 0,
  tokens_output int DEFAULT 0,
  cost_brl numeric(10,2) DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- ============ AUDITORIA ============
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- ============ PUBLIC BOOKING ============
CREATE TABLE public_booking_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  contact_phone text,
  ip text,
  user_agent text,
  completed bool DEFAULT false,
  appointment_id uuid REFERENCES appointments(id),
  created_at timestamptz DEFAULT now()
);

-- ============ INDEXES ============
CREATE INDEX idx_appointments_tenant_date ON appointments(tenant_id, start_at);
CREATE INDEX idx_appointments_professional_date ON appointments(professional_id, start_at);
CREATE INDEX idx_contacts_tenant_phone ON contacts(tenant_id, phone);
CREATE INDEX idx_messages_contact_created ON messages(contact_id, created_at DESC);
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_companies_tenant ON companies(tenant_id);
CREATE INDEX idx_professionals_tenant ON professionals(tenant_id);
CREATE INDEX idx_services_tenant ON services(tenant_id);
CREATE INDEX idx_conversation_states_tenant_contact ON conversation_states(tenant_id, contact_id);

-- ============ RLS ============
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies (tenant isolation)
CREATE POLICY tenant_isolation ON users
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON companies
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON professionals
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON services
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON service_categories
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON contacts
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON appointments
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON messages
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON whatsapp_sessions
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON settings
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON followups
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON coupons
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON subscriptions
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ============ SEED: PLANS ============
INSERT INTO plans VALUES
('essencial_monthly','Essencial Mensal','essencial','one_time',99.90,99.90,1,false,true),
('ia_monthly','IA Mensal','ia','one_time',149.90,149.90,1,true,true),
('essencial_recurrent','Essencial Recorrente','essencial','recurrent',79.90,79.90,1,false,true),
('ia_recurrent','IA Recorrente','ia','recurrent',129.90,129.90,1,true,true),
('essencial_semiannual','Essencial Semestral','essencial','semiannual',69.90,419.40,6,false,true),
('ia_semiannual','IA Semestral','ia','semiannual',129.90,779.40,6,true,true),
('essencial_annual','Essencial Anual','essencial','annual',59.90,718.80,12,false,true),
('ia_annual','IA Anual','ia','annual',119.90,1438.80,12,true,true);

-- ============ FUNCTION: get_available_slots ============
CREATE OR REPLACE FUNCTION get_available_slots(
  p_tenant_id uuid,
  p_professional_id uuid,
  p_service_id uuid,
  p_date date
) RETURNS TABLE(slot_start timestamptz, slot_end timestamptz)
LANGUAGE plpgsql
AS $$
DECLARE
  v_duration int;
  v_step int := 10;
BEGIN
  SELECT duration_min INTO v_duration FROM services WHERE id = p_service_id;

  RETURN QUERY
  WITH schedule AS (
    SELECT start_time, end_time, break_start, break_end
    FROM professional_schedules
    WHERE professional_id = p_professional_id
      AND weekday = EXTRACT(DOW FROM p_date)
  ),
  candidate_slots AS (
    SELECT generate_series(
      (p_date + (SELECT start_time FROM schedule))::timestamptz,
      (p_date + (SELECT end_time FROM schedule))::timestamptz - (v_duration || ' minutes')::interval,
      (v_step || ' minutes')::interval
    ) AS slot_start
  ),
  busy AS (
    SELECT start_at, end_at FROM appointments
    WHERE professional_id = p_professional_id
      AND tenant_id = p_tenant_id
      AND status IN ('pendente','confirmado')
      AND start_at::date = p_date
    UNION ALL
    SELECT start_at, end_at FROM professional_blocks
    WHERE professional_id = p_professional_id
      AND start_at::date <= p_date AND end_at::date >= p_date
    UNION ALL
    SELECT (p_date + break_start)::timestamptz, (p_date + break_end)::timestamptz
    FROM schedule WHERE break_start IS NOT NULL
  )
  SELECT cs.slot_start, cs.slot_start + (v_duration || ' minutes')::interval AS slot_end
  FROM candidate_slots cs
  WHERE NOT EXISTS (
    SELECT 1 FROM busy b
    WHERE tstzrange(cs.slot_start, cs.slot_start + (v_duration || ' minutes')::interval, '[)')
       && tstzrange(b.start_at, b.end_at, '[)')
  )
  AND cs.slot_start > now();
END;
$$;
