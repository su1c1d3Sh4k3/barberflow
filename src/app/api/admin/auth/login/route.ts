import { NextRequest, NextResponse } from "next/server";
import { signAdminToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Authenticate via Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      await new Promise((r) => setTimeout(r, 300));
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
    }

    // Check super admin flag in app_metadata
    if (!data.user.app_metadata?.is_super_admin) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const token = signAdminToken(email);

    const response = NextResponse.json({ success: true });
    response.cookies.set("barberflow_admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 86400, // 24h
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
