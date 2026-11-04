import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const next = params.next && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "/dashboard";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">Apex OS</p>
          <CardTitle className="text-xl">Acesso</CardTitle>
          <CardDescription>Autenticação Supabase. Os teus dados ficam isolados por RLS.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {params.error ? <p className="text-xs text-destructive">{params.error}</p> : null}
          <LoginForm next={next} />
        </CardContent>
      </Card>
    </main>
  );
}
