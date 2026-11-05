import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { requireUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser();

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar email={user.email ?? "utilizador"} />
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
