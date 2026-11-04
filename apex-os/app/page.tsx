import { ArrowRight, CandlestickChart, Radar, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

const MODULES = [
  { icon: ShoppingCart, title: "Dropshipping P&L", text: "Lucro real por encomenda (COGS, portes, gateway), Break-Even ROAS e P&L diário com ad spend." },
  { icon: Radar, title: "Shopify Spy Engine", text: "Monitoriza lojas concorrentes: produtos novos, mudanças de preço e ruturas, com alertas no Telegram." },
  { icon: CandlestickChart, title: "Trading Terminal", text: "Velas 1m em tempo real (Binance), calculadora de posição por risco e diário com Profit Factor." },
] as const;

export default async function LandingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-12 px-6 py-16">
      <div className="space-y-5">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Apex Operations OS</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">E-commerce, inteligência competitiva e risco de trading num só sistema.</h1>
        <p className="max-w-2xl text-muted-foreground">Tudo a correr em camadas gratuitas: Next.js, Supabase, GitHub Actions, Telegram e dados públicos da Binance.</p>
        <Link href="/login" className={buttonVariants({ size: "lg" })}>
          Entrar <ArrowRight />
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {MODULES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-lg border bg-card p-5">
            <Icon className="mb-3 h-5 w-5 text-primary" />
            <h2 className="mb-1 font-medium">{title}</h2>
            <p className="text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
