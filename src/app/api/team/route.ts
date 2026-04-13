import { NextRequest } from "next/server";
import { validateAuth, isAuthError, ok, apiError, db } from "@/app/api/_helpers";
import { logAudit } from "@/lib/audit";

/**
 * GET  /api/team — list team members for the tenant
 * POST /api/team — invite a new team member (stores invite in audit_logs)
 */

export async function GET(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const { data, error } = await db()
    .from("users")
    .select("id, name, email, role, created_at")
    .eq("tenant_id", auth.tenantId)
    .order("created_at", { ascending: true });

  if (error) return apiError(error.message, 500);
  return ok(data);
}

export async function POST(req: NextRequest) {
  const auth = validateAuth(req);
  if (isAuthError(auth)) return auth;

  const { email, role, name } = await req.json();
  if (!email) return apiError("Email is required", 422);

  const validRoles = ["admin", "professional", "receptionist"];
  const safeRole = validRoles.includes(role) ? role : "professional";

  const supabase = db();

  // Check if user with this email already exists in this tenant
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("tenant_id", auth.tenantId)
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    return apiError("Este email já pertence a um membro da equipe", 409);
  }

  // Check if invitation was already sent (via audit_logs)
  const { data: prevInvite } = await supabase
    .from("audit_logs")
    .select("id")
    .eq("tenant_id", auth.tenantId)
    .eq("action", "invite")
    .eq("entity", "team_member")
    .filter("metadata->>email", "eq", email)
    .maybeSingle();

  if (prevInvite) {
    return apiError("Convite já enviado para este email", 409);
  }

  // Record the invitation via audit log
  // In production, this would send an email invitation via Supabase Auth invite
  await logAudit(auth.tenantId, null, "invite", "team_member", null, {
    email,
    role: safeRole,
    name: name || email.split("@")[0],
    status: "pending",
  });

  return ok({
    email,
    role: safeRole,
    name: name || email.split("@")[0],
    status: "pending",
  }, 201);
}
