import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";

// Segunda barreira (a primeira é o proxy.ts): valida a sessão no servidor.
export default async function HubLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return <AppShell email={user.email}>{children}</AppShell>;
}
