"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Scissors } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { checkLoginRateLimit } from "@/lib/login-rate-limit";

const loginSchema = z.object({
  email: z.string().email("Email invalido"),
  password: z.string().min(6, "Minimo 6 caracteres"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    setError("");

    // Client-side rate limit check per email
    const rateLimitResult = checkLoginRateLimit(data.email);
    if (!rateLimitResult.allowed) {
      setError(
        `Muitas tentativas. Tente novamente em ${rateLimitResult.remainingMinutes} minutos.`
      );
      setLoading(false);
      return;
    }

    // Server-side rate limit check per IP
    try {
      const rateCheckRes = await fetch("/api/auth/rate-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      });
      const rateCheckData = await rateCheckRes.json();
      if (!rateCheckData.allowed) {
        const retryMinutes = Math.max(1, Math.ceil((rateCheckData.retryAfter || 60) / 60));
        setError(
          `Muitas tentativas deste dispositivo. Tente novamente em ${retryMinutes} minutos.`
        );
        setLoading(false);
        return;
      }
    } catch {
      // If rate-check endpoint is unreachable, proceed with login
    }

    // TODO: Cloudflare Turnstile integration placeholder
    // When ready, add <Turnstile siteKey="..." onVerify={setToken} /> component
    // and validate the token server-side before proceeding with login.

    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      setError("Email ou senha incorretos");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
  };

  return (
    <div className="flex min-h-screen">
      {/* Left side - Form */}
      <div className="flex w-full flex-col items-center justify-center px-8 lg:w-[60%]">
        <div className="w-full max-w-[400px]">
          {/* Logo */}
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-btn bg-secondary">
              <Scissors className="h-5 w-5 text-white" strokeWidth={1.5} />
            </div>
            <span className="text-xl font-bold text-foreground">BarberFlow</span>
          </div>

          <h1 className="mb-2 text-display font-bold text-foreground">
            Bem-vindo de volta
          </h1>
          <p className="mb-8 text-body-lg text-muted-foreground">
            Entre na sua conta para gerenciar sua barbearia
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div
                data-testid="login-error"
                className="rounded-input bg-red-50 px-4 py-3 text-sm text-error"
              >
                {error}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Email
              </label>
              <input
                {...register("email")}
                type="email"
                placeholder="seu@email.com"
                className="h-12 w-full rounded-input bg-surface-container-lowest px-4 text-sm text-foreground shadow-soft placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-error">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Senha
              </label>
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="h-12 w-full rounded-input bg-surface-container-lowest px-4 pr-12 text-sm text-foreground shadow-soft placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" strokeWidth={1.5} />
                  ) : (
                    <Eye className="h-5 w-5" strokeWidth={1.5} />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-error">{errors.password.message}</p>
              )}
            </div>

            <div className="flex justify-end">
              <Link
                href="/login"
                className="text-sm text-muted-foreground hover:text-secondary"
              >
                Esqueci minha senha
              </Link>
            </div>

            {/* TODO: Cloudflare Turnstile widget placeholder */}
            {/* <div data-testid="turnstile-placeholder" className="my-2">
              <Turnstile siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!} onVerify={setTurnstileToken} />
            </div> */}

            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-btn bg-primary font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-float disabled:opacity-50"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-sm text-muted-foreground">ou</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={handleGoogleLogin}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-btn border border-border bg-surface-container-lowest text-sm font-medium text-foreground transition-all hover:-translate-y-0.5 hover:shadow-soft"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Entrar com Google
          </button>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Nao tem conta?{" "}
            <Link href="/signup" className="font-medium text-secondary hover:underline">
              Cadastre-se gratis
            </Link>
          </p>
        </div>
      </div>

      {/* Right side - Decorative */}
      <div className="hidden lg:flex lg:w-[40%] lg:items-center lg:justify-center lg:bg-gradient-to-br lg:from-amber-400 lg:to-amber-500 lg:p-12">
        <div className="text-center">
          <div className="mx-auto mb-8 flex h-32 w-32 items-center justify-center rounded-full bg-white/20">
            <Scissors className="h-16 w-16 text-white" strokeWidth={1.5} />
          </div>
          <h2 className="mb-4 text-2xl font-bold text-white">
            Gerencie sua barbearia com facilidade
          </h2>
          <p className="text-white/80">
            Agendamento inteligente via WhatsApp, dashboard completo e muito mais.
          </p>

          {/* Testimonial card */}
          <div className="mt-8 rounded-card bg-white/20 p-6 backdrop-blur-sm">
            <p className="text-sm italic text-white">
              &ldquo;Reduzi 50% das faltas no primeiro mes&rdquo;
            </p>
            <p className="mt-2 text-xs font-medium text-white/80">
              — Joao, Barbearia Corte Fino
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
