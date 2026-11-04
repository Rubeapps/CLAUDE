import { z } from "zod";

/** Estado devolvido por todas as Server Actions de formulário (useActionState). */
export type ActionState = { status: "idle"; message: "" } | { status: "success"; message: string } | { status: "error"; message: string };

export const idleState: ActionState = { status: "idle", message: "" };

export function actionError(message: string): ActionState {
  return { status: "error", message };
}

export function actionSuccess(message: string): ActionState {
  return { status: "success", message };
}

/** Primeira mensagem de erro legível de um ZodError. */
export function zodMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Dados inválidos.";
  const field = issue.path.join(".");
  return field ? `${field}: ${issue.message}` : issue.message;
}

/** Converte FormData em objeto simples (strings), para validar com Zod. */
export function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") out[key] = value;
  });
  return out;
}

/** Número a partir de input de formulário; aceita vírgula decimal (pt-PT). */
export const formNumber = z
  .string()
  .trim()
  .min(1, "obrigatório")
  .transform((value) => Number.parseFloat(value.replace(",", ".")))
  .pipe(z.number().finite("número inválido"));
