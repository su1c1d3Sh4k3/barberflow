"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTenantStore } from "@/stores/tenant-store";
import type { User, Tenant, Company } from "@/types/database";
import { Shield, X } from "lucide-react";
import { useRouter } from "next/navigation";

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function ImpersonationBanner({ tenantName }: { tenantName: string }) {
  const router = useRouter();

  const handleExit = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    await fetch("/api/admin/impersonate/exit", { method: "POST" });
    router.push("/admin/dashboard");
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between bg-amber-500 px-6 py-2">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-white" strokeWidth={2} />
        <span className="text-sm font-semibold text-white">
          Acessando sistema de{" "}
          <span className="underline underline-offset-2">{tenantName}</span>{" "}
          como Super Admin
        </span>
      </div>
      <button
        onClick={handleExit}
        className="flex items-center gap-1.5 rounded-pill bg-white/20 hover:bg-white/30 px-3 py-1 text-xs font-semibold text-white transition-all"
      >
        <X className="h-3.5 w-3.5" />
        Sair da visualização
      </button>
    </div>
  );
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setTenant, setCompany, setLoading } = useTenantStore();
  const didRun = useRef(false);
  const [impersonateName, setImpersonateName] = useState<string | null>(null);

  useEffect(() => {
    // Check for impersonation cookie
    const name = getCookieValue("barberflow_impersonate_name");
    if (name) setImpersonateName(name);
  }, []);

  useEffect(() => {
    // Only run once
    if (didRun.current) return;
    didRun.current = true;

    async function loadTenantData() {
      const supabase = createClient();
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) {
          setLoading(false);
          return;
        }

        let { data: profile } = await supabase
          .from("users")
          .select("*")
          .eq("id", authUser.id)
          .single();

        if (!profile) {
          // JWT may not have tenant_id claim yet — refresh and retry
          await supabase.auth.refreshSession();
          const retry = await supabase
            .from("users")
            .select("*")
            .eq("id", authUser.id)
            .single();
          profile = retry.data;
        }

        if (!profile) {
          console.warn("[TenantProvider] No profile found for user", authUser.id);
          setLoading(false);
          return;
        }

        setUser(profile as User);

        const { data: tenant } = await supabase
          .from("tenants")
          .select("*")
          .eq("id", profile.tenant_id)
          .single();

        if (tenant) setTenant(tenant as Tenant);

        const { data: company } = await supabase
          .from("companies")
          .select("*")
          .eq("tenant_id", profile.tenant_id)
          .eq("is_default", true)
          .single();

        if (company) setCompany(company as Company);
      } catch (err) {
        console.error("[TenantProvider] Error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadTenantData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {impersonateName && <ImpersonationBanner tenantName={impersonateName} />}
      {/* Push content down if banner is showing */}
      <div className={impersonateName ? "pt-10" : ""}>
        {children}
      </div>
    </>
  );
}
