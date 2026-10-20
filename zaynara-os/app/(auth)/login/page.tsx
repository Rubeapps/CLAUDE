import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar · Zaynara OS" };

const ERRORS: Record<string, string> = {
  not_allowed: "Este email não tem acesso ao Zaynara OS.",
  auth_failed: "O link expirou ou já foi usado. Pede um novo.",
  missing_code: "Link de acesso inválido. Pede um novo.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const next = typeof params.next === "string" ? params.next : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <LoginForm initialError={error} next={next} />
    </main>
  );
}
