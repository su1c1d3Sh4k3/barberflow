"use client";

import { Shield, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

interface AdminTopbarProps {
  totalClients: number;
  activeClients: number;
  connectedWhatsApp: number;
}

export function AdminTopbar({ totalClients, activeClients, connectedWhatsApp }: AdminTopbarProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin");
  };

  return (
    <header className="fixed top-0 right-0 z-30 flex h-topbar items-center justify-between px-6 ml-sidebar bg-surface/80 backdrop-blur-xl border-b border-border/50">
      {/* Left: title + stats */}
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
            <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground leading-none">Painel Super Admin</p>
            <p className="text-[10px] text-muted-foreground">Gestão de clientes BarberFlow</p>
          </div>
        </div>

        <div className="h-5 w-px bg-border" />

        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-sm font-bold text-foreground">{totalClients}</p>
            <p className="text-[10px] text-muted-foreground">Total clientes</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{activeClients}</p>
            <p className="text-[10px] text-muted-foreground">Ativos</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{connectedWhatsApp}</p>
            <p className="text-[10px] text-muted-foreground">WhatsApp conectado</p>
          </div>
        </div>
      </div>

      {/* Right: logout */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="hidden lg:block text-xs font-medium text-muted-foreground">
          admin@barbearia.com
        </span>
        <button
          onClick={handleLogout}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-high text-muted-foreground hover:text-foreground transition-colors"
          title="Sair"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
