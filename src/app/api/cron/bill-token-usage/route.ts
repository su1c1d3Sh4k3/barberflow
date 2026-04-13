import { NextRequest } from "next/server";
import { ok, apiError, db } from "@/app/api/_helpers";

function validateCron(request: NextRequest): boolean {
  const secret = request.headers.get("x-cron-secret");
  return secret === process.env.CRON_SECRET;
}

/**
 * POST /api/cron/bill-token-usage
 * Monthly cron to bill tenants for AI token usage.
 *
 * 1. Finds all active subscriptions with has_ia=true
 * 2. Queries token_usage_ledger for unbilled entries with estimated_cost > 0
 * 3. Creates invoice records with type='tokens_addon'
 * 4. Marks ledger entries as billed=true
 */
export async function POST(request: NextRequest) {
  if (!validateCron(request)) return apiError("Unauthorized", 401);

  const supabase = db();

  try {
    // Find all active subscriptions where the plan has_ia=true
    const { data: subscriptions, error: subError } = await supabase
      .from("subscriptions")
      .select("id, tenant_id, plan_id, plans!inner(has_ia)")
      .eq("status", "active")
      .eq("plans.has_ia", true);

    if (subError) return apiError(subError.message, 500);
    if (!subscriptions || subscriptions.length === 0) {
      return ok({ billed_count: 0, message: "No active IA subscriptions found" });
    }

    let billedCount = 0;

    for (const sub of subscriptions) {
      // Query unbilled ledger entries with estimated_cost > 0
      const { data: ledgerEntries, error: ledgerError } = await supabase
        .from("token_usage_ledger")
        .select("*")
        .eq("subscription_id", sub.id)
        .eq("billed", false)
        .gt("estimated_cost", 0);

      if (ledgerError) {
        console.error(`Error querying ledger for subscription ${sub.id}:`, ledgerError.message);
        continue;
      }

      if (!ledgerEntries || ledgerEntries.length === 0) continue;

      for (const entry of ledgerEntries) {
        // Create an invoice record for this token usage
        const { data: invoice, error: invoiceError } = await supabase
          .from("invoices")
          .insert({
            tenant_id: sub.tenant_id,
            subscription_id: sub.id,
            type: "tokens_addon",
            description: `Uso de tokens IA - ${entry.period_start} a ${entry.period_end}`,
            value: entry.estimated_cost,
            status: "PENDING",
            billing_type: "PIX",
            due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split("T")[0],
            period_start: entry.period_start,
            period_end: entry.period_end,
          })
          .select("id")
          .single();

        if (invoiceError) {
          console.error(
            `Error creating invoice for tenant ${sub.tenant_id}:`,
            invoiceError.message
          );
          continue;
        }

        // TODO: In production, call Asaas API to create a payment:
        // const asaasPayment = await asaas.createPayment({
        //   customer: sub.asaas_customer_id,
        //   billingType: "PIX",
        //   value: entry.estimated_cost,
        //   dueDate: invoice.due_date,
        //   description: `Uso de tokens IA - ${entry.period_start} a ${entry.period_end}`,
        // });
        // Then update invoice with asaas_payment_id, invoice_url, pix_qr_code, etc.

        // Mark the ledger entry as billed
        const { error: updateError } = await supabase
          .from("token_usage_ledger")
          .update({
            billed: true,
            invoice_id: invoice?.id || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", entry.id);

        if (updateError) {
          console.error(
            `Error marking ledger entry ${entry.id} as billed:`,
            updateError.message
          );
          continue;
        }

        billedCount++;
      }
    }

    return ok({ billed_count: billedCount });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro ao processar cobranca de tokens";
    return apiError(message, 500);
  }
}
