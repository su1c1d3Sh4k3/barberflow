import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { TenantProvider } from "@/components/providers/tenant-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <div className="min-h-screen bg-surface">
        <Sidebar />
        <Topbar />
        <main className="ml-sidebar pt-topbar">
          <div className="mx-auto max-w-app p-6">{children}</div>
        </main>
      </div>
    </TenantProvider>
  );
}
