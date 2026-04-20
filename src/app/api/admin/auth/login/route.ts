import { NextRequest, NextResponse } from "next/server";
import { signAdminToken } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      return NextResponse.json({ error: "Admin não configurado" }, { status: 500 });
    }

    if (email !== adminEmail || password !== adminPassword) {
      // Small delay to prevent timing attacks
      await new Promise((r) => setTimeout(r, 300));
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
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
