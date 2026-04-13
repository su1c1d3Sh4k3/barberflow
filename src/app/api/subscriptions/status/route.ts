import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "@/app/api/_helpers";
import { getPayment, getPixQrCode } from "@/lib/asaas/payments";

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;
  const { tenantId } = auth;

  const supabase = db();

  // Fetch subscription
  const { data: sub } = await supabase
    .from("subscriptions").select("*").eq("tenant_id", tenantId).single();
  if (!sub) return apiError("No subscription found", 404);

  // Fetch latest invoice
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("due_date", { ascending: false })
    .limit(1)
    .single();

  let paymentStatus: string | null = invoice?.status ?? null;
  let pixQr: Record<string, unknown> | null = null;
  let bankSlipUrl: string | null = invoice?.bank_slip_url ?? null;

  // Refresh from Asaas if payment is pending
  if (invoice?.asaas_payment_id && invoice.status === "PENDING") {
    try {
      const payment: Record<string, unknown> = await getPayment(invoice.asaas_payment_id);
      paymentStatus = payment.status as string;

      // Update local invoice status
      await supabase.from("invoices")
        .update({ status: payment.status as string, bank_slip_url: payment.bankSlipUrl as string, invoice_url: payment.invoiceUrl as string })
        .eq("id", invoice.id);

      bankSlipUrl = (payment.bankSlipUrl as string) ?? bankSlipUrl;

      if (sub.payment_method === "PIX") {
        pixQr = await getPixQrCode(invoice.asaas_payment_id).catch(() => null);
      }

      // If confirmed, activate subscription
      if (["CONFIRMED", "RECEIVED"].includes(payment.status as string)) {
        await supabase.from("subscriptions")
          .update({ status: "active", updated_at: new Date().toISOString() })
          .eq("id", sub.id);
        sub.status = "active";
      }
    } catch { /* keep local data */ }
  }

  return ok({
    subscription_status: sub.status,
    plan_id: sub.plan_id,
    current_period_end: sub.current_period_end,
    payment_status: paymentStatus,
    pix_qr_code: pixQr?.encodedImage ?? invoice?.pix_qr_code,
    pix_copy_paste: pixQr?.payload ?? invoice?.pix_copy_paste,
    bank_slip_url: bankSlipUrl,
  });
}
