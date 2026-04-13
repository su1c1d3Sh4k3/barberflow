"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Scissors } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { validateCNPJ, formatCNPJ } from "@/lib/validations/cnpj";

const signupSchema = z
  .object({
    name: z.string().min(3, "Minimo 3 caracteres"),
    barbershopName: z.string().min(2, "Nome da barbearia e obrigatorio"),
    phone: z.string().min(10, "Telefone invalido"),
    email: z.string().email("Email invalido"),
    cnpj: z.string().optional(),
    password: z.string().min(6, "Minimo 6 caracteres"),
    confirmPassword: z.string(),
    terms: z.boolean().refine((v) => v, "Aceite os termos"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Senhas nao conferem",
    path: ["confirmPassword"],
  })
  .refine(
    (data) => {
      if (!data.cnpj || data.cnpj.trim() === "") return true;
      return validateCNPJ(data.cnpj);
    },
    {
      message: "CNPJ invalido. Verifique os digitos.",
      path: ["cnpj"],
    }
  );

type SignupForm = z.infer<typeof signupSchema>;

// Password strength calculation
function getPasswordStrength(password: string) {
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;

  const labels: Record<number, string> = {
    0: "",
    1: "Fraca",
    2: "Razoavel",
    3: "Boa",
    4: "Forte",
  };

  const colors: Record<number, string> = {
    0: "bg-gray-200",
    1: "bg-red-500",
    2: "bg-orange-500",
    3: "bg-yellow-500",
    4: "bg-green-500",
  };

  const textColors: Record<number, string> = {
    0: "text-muted-foreground",
    1: "text-red-600",
    2: "text-orange-600",
    3: "text-yellow-600",
    4: "text-green-600",
  };

  return { checks, score, label: labels[score], color: colors[score], textColor: textColors[score] };
}

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const [cnpjValue, setCnpjValue] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
  });

  const passwordStrength = useMemo(() => getPasswordStrength(passwordValue), [passwordValue]);

  const onSubmit = async (data: SignupForm) => {
    setLoading(true);
    setError("");

    try {
      // 1. Call server-side signup API (creates auth user + cascade atomically)
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          barbershopName: data.barbershopName,
          phone: data.phone,
          email: data.email,
          password: data.password,
          cnpj: data.cnpj || undefined,
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        setError(result.error || "Erro ao criar conta. Tente novamente.");
        setLoading(false);
        return;
      }

      // 2. Sign in with the newly created account
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (signInError) {
        setError("Conta criada! Faça login para continuar.");
        setLoading(false);
        router.push("/login");
        return;
      }

      // 3. Force token refresh to pick up the tenant_id claim set by admin API
      await supabase.auth.refreshSession();

      router.push("/onboarding");
    } catch (err) {
      console.error("Signup error:", err);
      setError("Erro de conexão. Tente novamente.");
      setLoading(false);
    }
  };

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCNPJ(e.target.value);
    setCnpjValue(formatted);
    setValue("cnpj", formatted);
  };

  return (
    <div className="flex min-h-screen">
      {/* Left side - Form */}
      <div className="flex w-full flex-col items-center justify-center px-8 py-12 lg:w-[60%]">
        <div className="w-full max-w-[400px]">
          {/* Logo */}
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-btn bg-secondary">
              <Scissors className="h-5 w-5 text-white" strokeWidth={1.5} />
            </div>
            <span className="text-xl font-bold text-foreground">BarberFlow</span>
          </div>

          <h1 className="mb-2 text-headline font-bold text-foreground">
            Crie sua conta gratis
          </h1>
          <p className="mb-6 text-body-lg text-muted-foreground">
            7 dias gratis, sem cartao de credito
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-input bg-red-50 px-4 py-3 text-sm text-error">
                {error}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium">Nome completo</label>
              <input
                {...register("name")}
                placeholder="Seu nome"
                className="h-12 w-full rounded-input bg-surface-container-lowest px-4 text-sm shadow-soft placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              {errors.name && <p className="mt-1 text-xs text-error">{errors.name.message}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Nome da barbearia</label>
              <input
                {...register("barbershopName")}
                placeholder="Barbearia Exemplo"
                className="h-12 w-full rounded-input bg-surface-container-lowest px-4 text-sm shadow-soft placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              {errors.barbershopName && <p className="mt-1 text-xs text-error">{errors.barbershopName.message}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Telefone</label>
              <input
                {...register("phone")}
                placeholder="(11) 99999-9999"
                className="h-12 w-full rounded-input bg-surface-container-lowest px-4 text-sm shadow-soft placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              {errors.phone && <p className="mt-1 text-xs text-error">{errors.phone.message}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Email</label>
              <input
                {...register("email")}
                type="email"
                placeholder="seu@email.com"
                className="h-12 w-full rounded-input bg-surface-container-lowest px-4 text-sm shadow-soft placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              {errors.email && <p className="mt-1 text-xs text-error">{errors.email.message}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                CNPJ <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                value={cnpjValue}
                onChange={handleCnpjChange}
                placeholder="00.000.000/0001-00"
                data-testid="cnpj-input"
                className="h-12 w-full rounded-input bg-surface-container-lowest px-4 text-sm shadow-soft placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              {errors.cnpj && (
                <p className="mt-1 text-xs text-error" data-testid="cnpj-error">
                  {errors.cnpj.message}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Senha</label>
              <div className="relative">
                <input
                  {...register("password", {
                    onChange: (e) => setPasswordValue(e.target.value),
                  })}
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimo 6 caracteres"
                  className="h-12 w-full rounded-input bg-surface-container-lowest px-4 pr-12 text-sm shadow-soft placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-error">{errors.password.message}</p>}

              {/* Password Strength Meter */}
              {passwordValue.length > 0 && (
                <div className="mt-2 space-y-1.5" data-testid="password-strength-meter">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        data-testid={`strength-bar-${level}`}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                          passwordStrength.score >= level
                            ? passwordStrength.color
                            : "bg-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                  <p
                    className={`text-xs font-medium ${passwordStrength.textColor}`}
                    data-testid="password-strength-label"
                  >
                    {passwordStrength.label}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Confirmar senha</label>
              <input
                {...register("confirmPassword")}
                type="password"
                placeholder="Repita a senha"
                className="h-12 w-full rounded-input bg-surface-container-lowest px-4 text-sm shadow-soft placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              {errors.confirmPassword && <p className="mt-1 text-xs text-error">{errors.confirmPassword.message}</p>}
            </div>

            <div className="flex items-start gap-3">
              <input
                {...register("terms")}
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-border text-secondary focus:ring-ring/40"
              />
              <label className="text-sm text-muted-foreground">
                Li e aceito os{" "}
                <Link href="#" className="text-secondary hover:underline">
                  Termos de Uso
                </Link>{" "}
                e{" "}
                <Link href="#" className="text-secondary hover:underline">
                  Politica de Privacidade
                </Link>
              </label>
            </div>
            {errors.terms && <p className="text-xs text-error">{errors.terms.message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-btn bg-primary font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-float disabled:opacity-50"
            >
              {loading ? "Criando conta..." : "Criar minha conta gratis"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Ja tem conta?{" "}
            <Link href="/login" className="font-medium text-secondary hover:underline">
              Entrar
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
            Tudo que sua barbearia precisa
          </h2>
          <p className="text-white/80">
            Agendamento via WhatsApp, gestao de clientes, profissionais e muito mais.
          </p>
        </div>
      </div>
    </div>
  );
}
