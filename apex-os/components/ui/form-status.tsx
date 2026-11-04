"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

export function SubmitButton({ children, pendingLabel, ...props }: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

export function ActionMessage({ state, className }: { state: ActionState; className?: string }) {
  if (state.status === "idle") return null;
  return (
    <p role="status" className={cn("text-xs", state.status === "error" ? "text-destructive" : "text-success", className)}>
      {state.message}
    </p>
  );
}
