import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { validateAdminRequest, signImpersonationToken } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { valid } = validateAdminRequest(request);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { tenantId } = body;
  if (!tenantId) return NextResponse.json({ error: "tenantId obrigatório" }, { status: 400 });

  const db = createServiceRoleClient();

  // Find owner user for this tenant
  const { data: ownerProfile, error: ownerError } = await db
    .from("users")
    .select("id, email, name")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .single();

  if (ownerError || !ownerProfile) {
    return NextResponse.json({ error: "Proprietário não encontrado para este tenant" }, { status: 404 });
  }

  // Find tenant name for the banner
  const { data: tenant } = await db
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .single();

  // Generate magic link so admin can sign in as owner (without sending email)
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink",
    email: ownerProfile.email,
  });

  if (linkError || !linkData) {
    return NextResponse.json({ error: "Falha ao gerar acesso: " + (linkError?.message || "erro desconhecido") }, { status: 500 });
  }

  // Extract token hash from action link
  const actionLink = linkData.properties?.action_link || "";
  let tokenHash: string | null = null;
  let otpType = "magiclink";
  try {
    const url = new URL(actionLink);
    tokenHash = url.searchParams.get("token");
    otpType = url.searchParams.get("type") || "magiclink";
  } catch {
    tokenHash = linkData.properties?.hashed_token || null;
  }

  if (!tokenHash) {
    return NextResponse.json({ error: "Não foi possível extrair o token de acesso" }, { status: 500 });
  }

  // Sign impersonation token for middleware validation
  const impersonateToken = signImpersonationToken(tenantId);
  const tenantName = tenant?.name || "Cliente";

  const response = NextResponse.json({
    tokenHash,
    otpType,
    tenantId,
    tenantName,
    ownerName: ownerProfile.name,
  });

  // Set impersonation cookies
  // httpOnly: secure validation in middleware
  response.cookies.set("barberflow_impersonate", impersonateToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7200, // 2h
    path: "/",
  });
  // Regular: for display in UI banner
  response.cookies.set("barberflow_impersonate_name", encodeURIComponent(tenantName), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7200,
    path: "/",
  });

  return response;
}
