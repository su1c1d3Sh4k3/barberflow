import { create } from "zustand";
import type { User, Tenant, Company } from "@/types/database";

interface TenantStore {
  user: User | null;
  tenant: Tenant | null;
  company: Company | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setTenant: (tenant: Tenant | null) => void;
  setCompany: (company: Company | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useTenantStore = create<TenantStore>((set) => ({
  user: null,
  tenant: null,
  company: null,
  loading: true,
  setUser: (user) => set({ user }),
  setTenant: (tenant) => set({ tenant }),
  setCompany: (company) => set({ company }),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ user: null, tenant: null, company: null, loading: false }),
}));
