"use client";

import { useActionState, useState } from "react";
import { ActionMessage, SubmitButton } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleState } from "@/lib/action-state";
import { authenticate } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [state, formAction] = useActionState(authenticate, idleState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="next" value={next} />
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} required />
      </div>
      <SubmitButton className="w-full" pendingLabel="A processar…">
        {mode === "signin" ? "Entrar" : "Criar conta"}
      </SubmitButton>
      <ActionMessage state={state} />
      <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="w-full text-center text-xs text-muted-foreground hover:text-foreground">
        {mode === "signin" ? "Ainda não tens conta? Criar conta" : "Já tens conta? Entrar"}
      </button>
    </form>
  );
}
