"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTenantStore } from "@/stores/tenant-store";
import type { User, Tenant, Company } from "@/types/database";

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setTenant, setCompany, setLoading } = useTenantStore();
  const didRun = useRef(false);

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

  return <>{children}</>;
}
