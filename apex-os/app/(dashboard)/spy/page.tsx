import { Activity, Boxes, Radar, Store } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProductFeed } from "@/components/spy/ProductFeed";
import { TargetsManager } from "@/components/spy/TargetsManager";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSpyData } from "@/lib/data/spy";
import { requireUser } from "@/lib/supabase/server";
import { isTelegramConfigured } from "@/lib/telegram";

export const metadata: Metadata = { title: "Spy Engine" };

export default async function SpyPage() {
  const { supabase, user } = await requireUser();
  const data = await getSpyData(supabase, user.id);
  const telegram = isTelegramConfigured();

  const stats = [
    { label: "Lojas", value: data.totals.targets, icon: Store },
    { label: "Ativas", value: data.totals.active, icon: Radar },
    { label: "Produtos monitorizados", value: data.totals.products, icon: Boxes },
    { label: "Mudanças de preço (24h)", value: data.totals.changes24h, icon: Activity },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shopify Spy Engine"
        description="Lê /products.json de cada loja: deteta produtos novos, alterações de preço e ruturas de stock."
        actions={<Badge variant={telegram ? "success" : "secondary"}>Telegram {telegram ? "ligado" : "não configurado"}</Badge>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
              </div>
              <Icon className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Lojas monitorizadas</CardTitle>
            <CardDescription>O cron do GitHub Actions corre todas as lojas ativas a cada 30 minutos.</CardDescription>
          </CardHeader>
          <CardContent>
            <TargetsManager targets={data.targets} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Feed</CardTitle>
            <CardDescription>Novidades, preços e ruturas das lojas concorrentes.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProductFeed newest={data.newest} priceChanges={data.priceChanges} outOfStock={data.outOfStock} stores={data.targets.map((t) => t.store_name)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
