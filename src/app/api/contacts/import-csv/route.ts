import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "../../_helpers";
import { normalizePhone } from "@/lib/phone";

interface CsvRow {
  name: string;
  phone: string;
  birthday?: string;
  tags?: string[];
  notes?: string;
}

/** POST /api/contacts/import-csv — bulk insert contacts from parsed CSV */
export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const { rows } = (await req.json()) as { rows: CsvRow[] };

  if (!Array.isArray(rows) || rows.length === 0) {
    return apiError("rows array is required", 422);
  }

  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  // Process in batches of 50
  const batchSize = 50;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize).map((r) => ({
      tenant_id: auth.tenantId,
      name: r.name?.trim(),
      phone: normalizePhone(r.phone?.trim() || ""),
      birthday: r.birthday?.trim() || null,
      tags: r.tags || null,
      notes: r.notes?.trim() || null,
      status: "pendente" as const,
    }));

    // Filter out invalid rows
    const valid = batch.filter((r) => r.name && r.phone && r.phone.length >= 10);
    const invalid = batch.length - valid.length;
    errorCount += invalid;
    if (invalid > 0) errors.push(`${invalid} rows skipped (missing name/phone)`);

    if (valid.length === 0) continue;

    const { error } = await db()
      .from("contacts")
      .upsert(valid, { onConflict: "tenant_id,phone", ignoreDuplicates: false });

    if (error) {
      errorCount += valid.length;
      errors.push(error.message);
    } else {
      successCount += valid.length;
    }
  }

  return ok({ success: successCount, errors: errorCount, messages: errors }, 201);
}
