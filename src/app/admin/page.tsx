"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Eye, EyeOff } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Credenciais inválidas");
        setLoading(false);
        return;
      }

      router.push("/admin/dashboard");
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-[420px]">
        {/* Card */}
        <div className="rounded-card bg-surface-container-lowest shadow-float p-8">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500 shadow-float">
              <Shield className="h-8 w-8 text-white" strokeWidth={1.5} />
            </div>
            <h1 className="text-headline font-bold text-foreground">Acesso Restrito</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Painel exclusivo para Super Admin
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-input bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-error">
                {error}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@barbearia.com"
                required
                className="h-12 w-full rounded-input bg-surface-container px-4 text-sm text-foreground shadow-soft placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="h-12 w-full rounded-input bg-surface-container px-4 pr-12 text-sm text-foreground shadow-soft placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/40"
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
            </div>

            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-btn bg-amber-500 font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-float disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Autenticando..." : "Entrar no painel"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Área restrita. Acesso não autorizado é proibido.
          </p>
        </div>

        {/* BarberFlow branding */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          BarberFlow SaaS · Super Admin Panel
        </p>
      </div>
    </div>
  );
}
