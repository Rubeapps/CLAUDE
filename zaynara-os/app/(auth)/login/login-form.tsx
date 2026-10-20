"use client";

import { Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type Status = { kind: "idle" } | { kind: "loading" } | { kind: "sent" } | { kind: "error"; message: string };

export function LoginForm({ initialError, next }: { initialError?: string; next?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>(
    initialError ? { kind: "error", message: initialError } : { kind: "idle" },
  );

  const redirectTo = () => {
    const url = new URL("/auth/callback", window.location.origin);
    if (next) url.searchParams.set("next", next);
    return url.toString();
  };

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ kind: "loading" });
    const { error } = await createClient().auth.signInWithOtp({
      email,
      // Nunca cria contas novas: o acesso é só para utilizadores já existentes.
      options: { emailRedirectTo: redirectTo(), shouldCreateUser: false },
    });
    setStatus(
      error
        ? { kind: "error", message: "Não foi possível enviar o link. Confirma o email." }
        : { kind: "sent" },
    );
  }

  async function signInWithGoogle() {
    setStatus({ kind: "loading" });
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (error) setStatus({ kind: "error", message: "Falhou o login com Google." });
  }

  const loading = status.kind === "loading";

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
          Z
        </div>
        <CardTitle className="text-xl">Zaynara OS</CardTitle>
        <CardDescription>Acesso privado</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {status.kind === "error" && (
          <Alert variant="destructive">
            <AlertDescription>{status.message}</AlertDescription>
          </Alert>
        )}

        {status.kind === "sent" ? (
          <Alert>
            <Mail />
            <AlertDescription>
              Se o email tiver acesso, recebes um link de entrada em {email}.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={sendMagicLink} className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@zaynara.pt"
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <Mail />}
              Enviar Magic Link
            </Button>
          </form>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" onClick={signInWithGoogle} disabled={loading}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
          </svg>
          Entrar com Google
        </Button>
      </CardContent>
    </Card>
  );
}
