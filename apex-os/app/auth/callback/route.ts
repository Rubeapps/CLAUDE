import { NextResponse, type NextRequest } from "next/server";
import { errorMessage } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

/** Troca o código PKCE do e-mail de confirmação por uma sessão (cookies) e redireciona. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Link de confirmação inválido.")}`);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  } catch (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorMessage(error))}`);
  }
}
