"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Users,
  Building2,
  Scissors,
  ClipboardList,
  Settings,
  Sparkles,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useTenantStore } from "@/stores/tenant-store";
import { useTheme } from "@/components/providers/theme-provider";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/contatos", label: "Contatos", icon: Users },
  { href: "/empresa", label: "Empresa", icon: Building2 },
  { href: "/profissionais", label: "Profissionais", icon: Scissors },
  { href: "/servicos", label: "Serviços", icon: ClipboardList },
  { href: "/definicoes", label: "Definições", icon: Settings },
  { href: "/definicoes/ia", label: "Definições da IA", icon: Sparkles },
  { href: "/definicoes/modo-teste", label: "Modo Teste", icon: FlaskConical },
  { href: "/whatsapp", label: "Conexão WhatsApp", icon: MessageCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { user, tenant } = useTenantStore();
  const { theme, toggleTheme } = useTheme();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-surface-container-low border-r border-border/50 transition-all duration-300 flex flex-col py-6 px-4",
        collapsed ? "w-sidebar-collapsed" : "w-sidebar"
      )}
    >
      {/* Collapse toggle — floating pill on the right edge */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-8 z-50 flex h-6 w-6 items-center justify-center rounded-full bg-surface-container-lowest border border-border shadow-sm text-muted-foreground hover:text-foreground hover:shadow transition-all"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      {/* Logo */}
      <div className="flex items-center gap-3 px-2 mb-10">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary dark:bg-amber-500">
          <Scissors className="h-5 w-5 text-white dark:text-slate-900" strokeWidth={1.5} />
        </div>
        {!collapsed && (
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">BarberFlow</h1>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">SaaS Premium</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/definicoes" && pathname?.startsWith(item.href + "/")) ||
            (item.href === "/definicoes" && pathname === "/definicoes");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 font-semibold tracking-tight text-sm",
                isActive
                  ? "text-foreground font-bold border-r-4 border-amber-500 bg-surface-container-lowest/50 dark:bg-white/5"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-container-lowest/80 dark:hover:bg-white/5"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={1.5} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section — user info + theme toggle */}
      <div className="mt-auto border-t border-border/50 pt-4 space-y-2">
        {!collapsed && user && (
          <div className="flex items-center gap-3 px-2 py-2">
            <Link href="/conta" className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
              <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-sm font-bold text-foreground/70 shrink-0">
                {user.name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{user.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{tenant?.name || "Carregando..."}</p>
              </div>
            </Link>
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-container hover:bg-surface-container-high text-muted-foreground hover:text-foreground transition-all"
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        )}
        {collapsed && user && (
          <div className="flex flex-col items-center gap-2">
            <Link
              href="/conta"
              className="flex items-center justify-center py-1 hover:opacity-80 transition-opacity"
            >
              <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-sm font-bold text-foreground/70">
                {user.name?.charAt(0).toUpperCase()}
              </div>
            </Link>
            <button
              onClick={toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container hover:bg-surface-container-high text-muted-foreground hover:text-foreground transition-all"
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        )}
        {!user && (
          <button
            onClick={toggleTheme}
            className="flex w-full items-center justify-center py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-container transition-all"
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        )}
      </div>
    </aside>
  );
}
