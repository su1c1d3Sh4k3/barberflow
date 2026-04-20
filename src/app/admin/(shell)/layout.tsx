import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <AdminSidebar />
      <main className="ml-sidebar pt-topbar">
        <div className="mx-auto max-w-app p-6">{children}</div>
      </main>
    </div>
  );
}
