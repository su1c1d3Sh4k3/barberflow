"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Users, ChevronLeft, ChevronRight, Sun, Moon, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useTheme } from "@/components/providers/theme-provider";

const navItems = [
  { href: "/admin/dashboard", label: "Clientes", icon: Users },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const handleLogout = async () => {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin");
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-surface-container-low border-r border-border/50 transition-all duration-300 flex flex-col py-6 px-4",
        collapsed ? "w-sidebar-collapsed" : "w-sidebar"
      )}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-8 z-50 flex h-6 w-6 items-center justify-center rounded-full bg-surface-container-lowest border border-border shadow-sm text-muted-foreground hover:text-foreground hover:shadow transition-all"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      {/* Logo */}
      <div className="flex items-center gap-3 px-2 mb-10">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary dark:bg-amber-500 shrink-0">
          <Shield className="h-5 w-5 text-white dark:text-slate-900" strokeWidth={1.5} />
        </div>
        {!collapsed && (
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">BarberFlow</h1>
            <p className="text-[10px] uppercase tracking-widest text-amber-500 font-bold">Super Admin</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
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

      {/* Bottom section */}
      <div className="mt-auto border-t border-border/50 pt-4 space-y-2">
        {!collapsed && (
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">Super Admin</p>
                <button
                  onClick={handleLogout}
                  className="text-[10px] text-muted-foreground hover:text-error transition-colors"
                >
                  Sair do painel
                </button>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-container hover:bg-surface-container-high text-muted-foreground hover:text-foreground transition-all"
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        )}
        {collapsed && (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
            </div>
            <button
              onClick={toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container hover:bg-surface-container-high text-muted-foreground hover:text-foreground transition-all"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
