import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "@/app/api/_helpers";
import { createCustomer } from "@/lib/asaas/customers";
import { createPayment, getPixQrCode } from "@/lib/asaas/payments";
import { createSubscription } from "@/lib/asaas/subscriptions";

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { tenantId } = auth;

  const {
    plan_id, payment_method, customer_name, customer_email, customer_cpf,
    credit_card, credit_card_holder_info,
  } = await req.json();
  if (!plan_id || !payment_method || !customer_name || !customer_email)
    return apiError("Missing required fields");

  // Validate credit card data when payment method is CREDIT_CARD
  if (payment_method === "CREDIT_CARD") {
    if (!credit_card || !credit_card.number || !credit_card.holder_name ||
        !credit_card.expiry_month || !credit_card.expiry_year || !credit_card.ccv) {
      return apiError("Credit card data is required for card payments");
    }
    if (!credit_card_holder_info || !credit_card_holder_info.cpf) {
      return apiError("CPF do titular is required for card payments");
    }
  }

  // Build Asaas credit card objects
  const creditCardAsaas = payment_method === "CREDIT_CARD" ? {
    holderName: credit_card.holder_name,
    number: credit_card.number.replace(/\s/g, ""),
    expiryMonth: credit_card.expiry_month,
    expiryYear: credit_card.expiry_year,
    ccv: credit_card.ccv,
  } : undefined;

  const creditCardHolderInfoAsaas = payment_method === "CREDIT_CARD" ? {
    name: credit_card_holder_info?.name || customer_name,
    email: credit_card_holder_info?.email || customer_email,
    cpfCnpj: credit_card_holder_info.cpf.replace(/[.\-]/g, ""),
  } : undefined;

  // Get client IP for fraud prevention
  const remoteIp = payment_method === "CREDIT_CARD"
    ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1"
    : undefined;

  const supabase = db();

  // 1. Fetch plan
  const { data: plan, error: planErr } = await supabase
    .from("plans").select("*").eq("id", plan_id).single();
  if (planErr || !plan) return apiError("Plan not found", 404);

  // 2. Create Asaas customer
  const asaasCustomer = await createCustomer({
    name: customer_name,
    email: customer_email,
    cpfCnpj: customer_cpf,
  });

  // 3. Compute period
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + plan.cycle_months);
  const dueDate = now.toISOString().slice(0, 10);

  // 4. Get or create subscription record
  const { data: sub } = await supabase
    .from("subscriptions").select("id").eq("tenant_id", tenantId).single();

  const subId = sub?.id;

  let asaasPaymentId: string | undefined;
  let asaasSubId: string | undefined;

  // 5. Create Asaas payment or subscription
  if (plan.billing_type === "recurrent") {
    const asSub: Record<string, unknown> = await createSubscription({
      customer: asaasCustomer.id,
      billingType: payment_method,
      value: plan.total_value,
      cycle: "MONTHLY",
      description: plan.name,
      externalReference: subId,
      ...(creditCardAsaas && { creditCard: creditCardAsaas }),
      ...(creditCardHolderInfoAsaas && { creditCardHolderInfo: creditCardHolderInfoAsaas }),
      ...(remoteIp && { remoteIp }),
    });
    asaasSubId = asSub.id as string;
    // first payment comes from subscription
    const payments = await import("@/lib/asaas/subscriptions").then(m =>
      m.getSubscriptionPayments(asSub.id as string)) as Record<string, unknown>;
    const paymentList = payments?.data as Record<string, unknown>[] | undefined;
    asaasPaymentId = paymentList?.[0]?.id as string | undefined;
  } else {
    const payment: Record<string, unknown> = await createPayment({
      customer: asaasCustomer.id,
      billingType: payment_method,
      value: plan.total_value,
      dueDate,
      description: plan.name,
      externalReference: subId,
      ...(creditCardAsaas && { creditCard: creditCardAsaas }),
      ...(creditCardHolderInfoAsaas && { creditCardHolderInfo: creditCardHolderInfoAsaas }),
      ...(remoteIp && { remoteIp }),
    });
    asaasPaymentId = payment.id as string;
  }

  // 6. Fetch PIX QR if needed
  let pixQr: Record<string, unknown> | null = null;
  if (payment_method === "PIX" && asaasPaymentId) {
    pixQr = await getPixQrCode(asaasPaymentId).catch(() => null);
  }

  // 7. Save invoice
  await supabase.from("invoices").insert({
    tenant_id: tenantId,
    subscription_id: subId,
    asaas_payment_id: asaasPaymentId,
    type: "subscription",
    description: plan.name,
    value: plan.total_value,
    status: "PENDING",
    billing_type: payment_method,
    due_date: dueDate,
    pix_qr_code: pixQr?.encodedImage,
    pix_copy_paste: pixQr?.payload,
    period_start: dueDate,
    period_end: periodEnd.toISOString().slice(0, 10),
  });

  // 8. Update subscription record
  await supabase.from("subscriptions").upsert({
    id: subId,
    tenant_id: tenantId,
    plan_id,
    status: "pending_payment",
    payment_method,
    asaas_customer_id: asaasCustomer.id,
    asaas_subscription_id: asaasSubId ?? null,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "tenant_id" });

  return ok({
    payment_id: asaasPaymentId,
    pix_qr_code: pixQr?.encodedImage,
    pix_copy_paste: pixQr?.payload,
  });
}
