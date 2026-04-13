"use client";

import { Bell, Search, MapPin, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useTenantStore } from "@/stores/tenant-store";

export function Topbar() {
  const router = useRouter();
  const supabase = createClient();
  const { user, company } = useTenantStore();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    useTenantStore.getState().reset();
    router.push("/login");
  };

  return (
    <header className="fixed top-0 right-0 z-30 flex h-topbar items-center justify-between px-8 ml-sidebar bg-surface/80 backdrop-blur-xl border-b border-border/50">
      {/* Search */}
      <div className="flex items-center gap-4 flex-1">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
          <input
            type="text"
            placeholder="Pesquisar..."
            className="w-full pl-10 pr-4 py-2 bg-surface-container-low border-none rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-amber-500/40 focus:outline-none"
          />
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4 text-muted-foreground">
          <button className="hover:text-amber-500 transition-colors relative">
            <Bell className="h-5 w-5" strokeWidth={1.5} />
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-error border-2 border-surface" />
          </button>
          <button className="hover:text-amber-500 transition-colors">
            <MapPin className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-3">
          <div className="text-right hidden lg:block">
            <p className="text-sm font-bold text-foreground">{user?.name?.split(" ")[0] || "Perfil"}</p>
            <p className="text-[10px] text-muted-foreground">{company?.name || ""}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-high text-muted-foreground hover:text-foreground transition-colors"
            title="Sair"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </header>
  );
}
