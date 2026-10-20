import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadCostConfig } from "@/lib/dashboard/load";
import { fetchProducts, type ShopifyProduct } from "@/lib/integrations/shopify";
import { formatNumber } from "@/lib/utils";
import { BusinessSettingsForm, ProductMappingForm } from "./forms";

export const metadata: Metadata = { title: "Definições · Zaynara OS" };

export default async function SettingsPage() {
  const [config, products] = await Promise.all([
    loadCostConfig(),
    fetchProducts().then(
      (p): ShopifyProduct[] | Error => p,
      (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
    ),
  ]);

  // Tabela atual (versão mais recente de cada tarifa) agrupada por produto/país.
  const latest = new Map<string, (typeof config.supplierRates)[number]>();
  for (const r of config.supplierRates) {
    const key = `${r.productKey}|${r.country}|${r.quantity}`;
    const cur = latest.get(key);
    if (!cur || (r.validFrom ?? "") > (cur.validFrom ?? "")) latest.set(key, r);
  }
  const rows = [...latest.values()].sort(
    (a, b) => a.productKey.localeCompare(b.productKey) || a.country.localeCompare(b.country) || a.quantity - b.quantity,
  );

  return (
    <>
      <PageHeader title="Definições" description="Regras usadas no cálculo do lucro real." />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Fiscalidade e envio</CardTitle>
            <CardDescription>
              Isento: o IVA pago em anúncios e taxas não é recuperável, por isso entra como custo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BusinessSettingsForm settings={config.settings} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Produtos da Shopify → tabela de custos</CardTitle>
            <CardDescription>Diz que tabela do fornecedor se aplica a cada produto.</CardDescription>
          </CardHeader>
          <CardContent>
            {products instanceof Error ? (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertTitle>Shopify indisponível</AlertTitle>
                <AlertDescription>{products.message}</AlertDescription>
              </Alert>
            ) : config.costProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ainda não há tabela de custos. Corre <code>supabase/seed/supplier_rates.sql</code> no SQL Editor.
              </p>
            ) : (
              <ProductMappingForm
                shopifyProducts={products}
                costProducts={config.costProducts.map((c) => ({
                  id: c.id,
                  name: c.name,
                  currency: c.currency,
                  bundledExtraShipping: c.bundledExtraShipping,
                  shopifyProductIds: c.shopifyProductIds,
                  isPrimary: c.key === config.settings.primaryProductKey,
                }))}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tabela do fornecedor em vigor</CardTitle>
            <CardDescription>Produto + envio por país e quantidade. Para alterar, insere uma nova linha com nova data.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>País</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Produto</TableHead>
                    <TableHead className="text-right">Envio</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={`${r.productKey}-${r.country}-${r.quantity}`}>
                      <TableCell>{r.productKey}</TableCell>
                      <TableCell>{r.country}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(r.productCost)} {r.currency}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(r.shippingCost)} {r.currency}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(r.productCost + r.shippingCost)} {r.currency}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
