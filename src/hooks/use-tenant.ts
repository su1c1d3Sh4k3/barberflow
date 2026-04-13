"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, Tenant } from "@/types/database";

interface TenantContext {
  user: User | null;
  tenant: Tenant | null;
  loading: boolean;
}

export function useTenant(): TenantContext {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (profile) {
        setUser(profile as User);

        const { data: tenantData } = await supabase
          .from("tenants")
          .select("*")
          .eq("id", profile.tenant_id)
          .single();

        if (tenantData) setTenant(tenantData as Tenant);
      }

      setLoading(false);
    }

    load();
  }, [supabase]);

  return { user, tenant, loading };
}
