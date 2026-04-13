import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Insert an audit log entry.
 *
 * Call from any server-side code (API routes, server actions, cron jobs).
 * Failures are swallowed so audit logging never breaks the primary operation.
 */
export async function logAudit(
  tenantId: string,
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      user_id: userId || null,
      action,
      entity,
      entity_id: entityId || null,
      metadata: metadata || {},
    });
  } catch {
    // Never let audit logging break the caller
    console.error("[audit] Failed to write audit log", { tenantId, action, entity });
  }
}
