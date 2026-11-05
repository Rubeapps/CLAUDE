"use client";

import { AlertTriangle, BookOpen, Brain, Calculator, CheckCircle2, Gauge, GraduationCap, Landmark, Scale, ShieldCheck, Workflow } from "lucide-react";
import { useActionState, useState, useTransition, type ReactNode } from "react";
import { reconcileVault, saveVaultSettings, setChecklistItem } from "@/app/(dashboard)/knowledge/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionMessage, SubmitButton } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { idleState } from "@/lib/action-state";
import { calculateCashCycle, calculatePnlCascade, calculateTaxVault } from "@/lib/calculations/treasury";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Academy } from "./Academy";

export interface HubMetrics {
  currency: string;
  days: number;
  orders: number;
  revenue: number;
  refunds: number;
  cogs: number;
  shipping: number;
  gatewayFees: number;
  adSpend: number;
  netProfit: number;
}

export interface HubVault {
  vatPercent: number;
  incomeTaxPercent: number;
  rollingReservePercent: number;
  totalTaxReserved: number;
  lastReconciliation: string | null;
}

type Tab = "academy" | "governance" | "ecommerce";

function num(value: string, fallback = 0): number {
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function NumberField({ id, label, value, onChange, suffix }: { id: string; label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {label}
        {suffix ? <span className="text-muted-foreground"> ({suffix})</span> : null}
      </Label>
      <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="h-8" />
    </div>
  );
}

function Principle({ icon: Icon, who, title, children }: { icon: typeof Brain; who: string; title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-primary">
          <Icon className="h-4 w-4" /> {who}
        </p>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return <p className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground">{children}</p>;
}

/* ─── Aba 1: Governança & modelos mentais ─────────────────────────────────── */

function OwnerEarningsCalculator({ metrics }: { metrics: HubMetrics }) {
  const money = (v: number) => formatCurrency(v, metrics.currency);
  const [net, setNet] = useState(metrics.netProfit.toFixed(2));
  const [dep, setDep] = useState("0");
  const [capex, setCapex] = useState("0");
  const [wc, setWc] = useState("0");
  const oe = num(net) + num(dep) - num(capex) - num(wc);
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs font-medium text-foreground">Calcula os teus Owner Earnings ({metrics.days} dias)</p>
      <div className="grid grid-cols-2 gap-2">
        <NumberField id="oe-net" label="Lucro líquido" value={net} onChange={setNet} />
        <NumberField id="oe-dep" label="Depreciações" value={dep} onChange={setDep} />
        <NumberField id="oe-capex" label="Capex de manutenção" value={capex} onChange={setCapex} suffix="stock/ads para manter vendas" />
        <NumberField id="oe-wc" label="Δ Fundo de maneio" value={wc} onChange={setWc} suffix="dinheiro preso" />
      </div>
      <p className="text-sm">
        Owner Earnings: <strong className={cn("tabular-nums", oe >= 0 ? "text-success" : "text-destructive")}>{money(oe)}</strong>
      </p>
    </div>
  );
}

function GovernanceTab({ metrics }: { metrics: HubMetrics }) {
  const money = (v: number) => formatCurrency(v, metrics.currency);
  const throughput = metrics.revenue - metrics.refunds - metrics.cogs - metrics.shipping - metrics.gatewayFees;
  const throughputPerAdEuro = metrics.adSpend > 0 ? throughput / metrics.adSpend : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Principle icon={Landmark} who="Warren Buffett & Charlie Munger" title="Owner Earnings, inversão e fosso económico">
        <p>O lucro contabilístico pode ser uma ilusão. O que conta é o dinheiro que podes retirar sem encolher o negócio.</p>
        <Formula>Owner Earnings = Lucro líquido + Depreciações − Capex de manutenção − Δ Fundo de maneio</Formula>
        <p>
          Se faturas 50.000 € mas tens de reinvestir 45.000 € em anúncios e stock só para manter as vendas, os teus Owner Earnings são quase nulos.
        </p>
        <OwnerEarningsCalculator metrics={metrics} />
        <p>
          <strong className="text-foreground">Inverte, inverte sempre.</strong> Em vez de &quot;como chego aos 100k€?&quot;, pergunta &quot;o que garante a falência em 90 dias?&quot;:
          bloqueio do gateway, um único fornecedor, devoluções acima de 8%, CPA descontrolado. Constrói uma barreira para cada um.
        </p>
        <p>
          <strong className="text-foreground">Fosso.</strong> Em dropshipping puro não há fosso estrutural: qualquer pessoa vende o mesmo produto amanhã. O fosso faz-se com rapidez de
          envio, marca (visual, packaging, suporte) e ofertas em bundle que baixam o custo de aquisição.
        </p>
      </Principle>

      <Principle icon={Workflow} who="Eliyahu M. Goldratt — The Goal" title="Teoria dos constrangimentos">
        <p>
          Cada sistema tem, num dado momento, um único estrangulamento principal. Otimizar o resto (velocidade da loja, 0,50 € com o fornecedor) não serve de nada se o
          gargalo for a conversão da página ou o limite de gasto da conta de anúncios.
        </p>
        <Formula>Throughput = Vendas − Custos totalmente variáveis (COGS + portes + taxas)</Formula>
        <div className="grid grid-cols-2 gap-2 rounded-md border p-3 text-xs">
          <div>
            <p className="text-muted-foreground">Throughput ({metrics.days} dias)</p>
            <p className="text-base font-semibold tabular-nums text-foreground">{money(throughput)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Throughput por 1 € de ads</p>
            <p className="text-base font-semibold tabular-nums text-foreground">{throughputPerAdEuro === null ? "—" : money(throughputPerAdEuro)}</p>
          </div>
        </div>
        <p>O objetivo não é cortar custos às cegas: é aumentar a velocidade a que o ad spend e o inventário se transformam em throughput.</p>
      </Principle>

      <Principle icon={Gauge} who="Andy Grove (Intel) & Keith Rabois" title="Indicadores preditivos vs. de atraso">
        <p>
          <strong className="text-foreground">Indicador de atraso:</strong> o lucro no fim do mês. Quando o vês, já não o podes mudar.
        </p>
        <p>
          <strong className="text-foreground">Indicadores preditivos</strong> que o Apex OS já mede:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Hook rate dos 3 primeiros segundos e hold rate (Ad Fatigue Radar, em Dropshipping)</li>
          <li>ROAS diário vs. Break-Even ROAS (P&L diário)</li>
          <li>Movimento de stock e preços da concorrência (Spy Engine e Anúncios Meta)</li>
          <li>Velocidade de tracking do fornecedor nas primeiras 24 h (verificar no fornecedor)</li>
        </ul>
        <p>
          <strong className="text-foreground">High Output Management:</strong> cada hora deve ter alavancagem. O scraping automático liberta-te da pesquisa manual para criares
          ângulos de marketing.
        </p>
      </Principle>

      <Principle icon={Brain} who="Ray Dalio (Bridgewater)" title="O negócio como máquina de regras">
        <p>
          Trata o negócio como uma máquina de causas e efeitos. Transforma cada decisão recorrente numa regra escrita, para tirar a emoção da compra de anúncios e do fecho de um
          trade.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Criativo com frequência ≥ 2,2 ou CPA &gt; break-even com CTR &lt; 1% ⇒ trocar criativo (Ad Fatigue Radar).</li>
          <li>Perda diária ≥ limite da conta ⇒ terminal bloqueado até à próxima sessão (circuit breaker).</li>
          <li>Sem checklist anti-FOMO completo ⇒ sem trade.</li>
          <li>Lucro distribuído por percentagens fixas (War Chest), não pelo estado de espírito.</li>
        </ul>
      </Principle>
    </div>
  );
}

/* ─── Aba 2: Contabilidade & e-commerce ───────────────────────────────────── */

function PnlCascadeCard({ metrics, vault }: { metrics: HubMetrics; vault: HubVault }) {
  const money = (v: number) => formatCurrency(v, metrics.currency);
  const [platform, setPlatform] = useState("0");
  const [fixed, setFixed] = useState("60");
  const [vat, setVat] = useState(String(vault.vatPercent));
  const [tax, setTax] = useState(String(vault.incomeTaxPercent));
  const cascade = calculatePnlCascade({
    grossRevenue: metrics.revenue + metrics.refunds,
    refundsAndDiscounts: metrics.refunds,
    cogs: metrics.cogs,
    shipping: metrics.shipping,
    gatewayFees: metrics.gatewayFees,
    platformFees: num(platform),
    adSpend: metrics.adSpend,
    fixedCosts: num(fixed),
    vatPercent: num(vat, 23),
    incomeTaxPercent: num(tax, 20),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-primary" /> P&L em cascata — os teus últimos {metrics.days} dias
        </CardTitle>
        <CardDescription>O ROAS e a faturação do Shopify não dizem quanto podes retirar. Esta cascata diz.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NumberField id="pl-platform" label="Taxas Shopify" value={platform} onChange={setPlatform} suffix="€" />
          <NumberField id="pl-fixed" label="Custos fixos" value={fixed} onChange={setFixed} suffix="€" />
          <NumberField id="pl-vat" label="IVA" value={vat} onChange={setVat} suffix="%" />
          <NumberField id="pl-tax" label="IRS/IRC efetivo" value={tax} onChange={setTax} suffix="%" />
        </div>
        <Table>
          <TableBody>
            {cascade.steps.map((step) => (
              <TableRow key={step.key} className={cn(step.kind === "=" && "bg-muted/40 font-semibold")}>
                <TableCell className="w-8 font-mono text-muted-foreground">{step.kind === "=" ? "=" : step.kind}</TableCell>
                <TableCell>{step.label}</TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    step.kind === "-" && "text-muted-foreground",
                    step.key === "ncp" && (step.value >= 0 ? "text-success" : "text-destructive"),
                  )}
                >
                  {step.kind === "-" ? `−${money(step.value)}` : money(step.value)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          IVA calculado como incluído nos preços (Faturação líquida × taxa / (100 + taxa)), à taxa portuguesa por omissão. Acima do limiar OSS aplica-se a taxa do país do
          cliente. Valores indicativos: confirma com o teu contabilista certificado.
        </p>
      </CardContent>
    </Card>
  );
}

function CashCycleCard({ metrics, vault }: { metrics: HubMetrics; vault: HubVault }) {
  const money = (v: number) => formatCurrency(v, metrics.currency);
  const days = Math.max(1, metrics.days);
  const [revenue, setRevenue] = useState((metrics.revenue / days).toFixed(2));
  const [ads, setAds] = useState((metrics.adSpend / days).toFixed(2));
  const [supplier, setSupplier] = useState(((metrics.cogs + metrics.shipping) / days).toFixed(2));
  const [gateway, setGateway] = useState("4");
  const [supplierDays, setSupplierDays] = useState("0");
  const [adDays, setAdDays] = useState("1");
  const [reservePct, setReservePct] = useState(String(vault.rollingReservePercent));
  const [reserveDays, setReserveDays] = useState("90");
  const r = calculateCashCycle({
    dailyRevenue: num(revenue),
    dailyAdSpend: num(ads),
    dailySupplierCost: num(supplier),
    gatewayPayoutDays: num(gateway),
    supplierPaymentDays: num(supplierDays),
    adBillingDays: num(adDays),
    rollingReservePercent: num(reservePct),
    rollingReserveDays: num(reserveDays),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" /> Ciclo de conversão de caixa
        </CardTitle>
        <CardDescription>
          A Meta cobra em 24–48 h, o fornecedor quer pagamento imediato e o gateway paga em D+2 a D+7. Se as vendas duplicarem amanhã, podes ficar sem liquidez mesmo com lucro.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NumberField id="cc-rev" label="Faturação / dia" value={revenue} onChange={setRevenue} />
          <NumberField id="cc-ads" label="Ads / dia" value={ads} onChange={setAds} />
          <NumberField id="cc-sup" label="Fornecedor / dia" value={supplier} onChange={setSupplier} />
          <NumberField id="cc-gw" label="Payout gateway" value={gateway} onChange={setGateway} suffix="dias" />
          <NumberField id="cc-supd" label="Prazo fornecedor" value={supplierDays} onChange={setSupplierDays} suffix="dias" />
          <NumberField id="cc-adsd" label="Cobrança ads" value={adDays} onChange={setAdDays} suffix="dias" />
          <NumberField id="cc-rp" label="Rolling reserve" value={reservePct} onChange={setReservePct} suffix="%" />
          <NumberField id="cc-rd" label="Retenção" value={reserveDays} onChange={setReserveDays} suffix="dias" />
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Capital preso (ads + fornecedor)</dt>
            <dd className="font-semibold tabular-nums">{money(r.workingCapitalNeeded)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Retido em rolling reserve</dt>
            <dd className="font-semibold tabular-nums">{money(r.rollingReserveHeld)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Colchão 20% de 30 dias</dt>
            <dd className="font-semibold tabular-nums">{money(r.recommendedCushion)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Liquidez a ter disponível</dt>
            <dd className="text-lg font-semibold tabular-nums text-primary">{money(r.totalLiquidityRequired)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function TaxVaultCard({ metrics, vault }: { metrics: HubMetrics; vault: HubVault }) {
  const money = (v: number) => formatCurrency(v, metrics.currency);
  const [settingsState, settingsAction] = useActionState(saveVaultSettings, idleState);
  const [reconcileState, reconcileAction] = useActionState(reconcileVault, idleState);
  const v = calculateTaxVault({
    revenue: metrics.revenue,
    netProfit: metrics.netProfit,
    vatPercent: vault.vatPercent,
    incomeTaxPercent: vault.incomeTaxPercent,
    rollingReservePercent: vault.rollingReservePercent,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary" /> Cofre fiscal
        </CardTitle>
        <CardDescription>Separa o dinheiro do Estado (IVA e IRS/IRC) e a reserva do gateway do dinheiro que podes gastar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">IVA a entregar</dt>
            <dd className="font-semibold tabular-nums">{money(v.vatReserved)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">IRS/IRC estimado</dt>
            <dd className="font-semibold tabular-nums">{money(v.incomeTaxReserved)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Reserva do gateway</dt>
            <dd className="font-semibold tabular-nums">{money(v.rollingReserve)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Disponível para gastar</dt>
            <dd className={cn("text-lg font-semibold tabular-nums", v.availableToSpend >= 0 ? "text-success" : "text-destructive")}>{money(v.availableToSpend)}</dd>
          </div>
        </dl>
        <form action={settingsAction} className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="v-vat">IVA %</Label>
            <Input id="v-vat" name="estimated_vat_percent" inputMode="decimal" defaultValue={vault.vatPercent} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="v-tax">IRS/IRC %</Label>
            <Input id="v-tax" name="estimated_income_tax_percent" inputMode="decimal" defaultValue={vault.incomeTaxPercent} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="v-res">Rolling reserve %</Label>
            <Input id="v-res" name="rolling_reserve_percent" inputMode="decimal" defaultValue={vault.rollingReservePercent} className="h-8" />
          </div>
          <SubmitButton size="sm" pendingLabel="A guardar…">
            Guardar taxas
          </SubmitButton>
          <div className="col-span-full">
            <ActionMessage state={settingsState} />
          </div>
        </form>
        <form action={reconcileAction} className="flex flex-wrap items-center gap-2 text-xs">
          <input type="hidden" name="total_tax_reserved" value={(v.vatReserved + v.incomeTaxReserved).toFixed(2)} />
          <span className="text-muted-foreground">
            Última reserva registada: {money(vault.totalTaxReserved)} em {formatDateTime(vault.lastReconciliation)}
          </span>
          <SubmitButton size="sm" variant="outline" pendingLabel="…">
            Registar {money(v.vatReserved + v.incomeTaxReserved)} como reservado
          </SubmitButton>
          <ActionMessage state={reconcileState} />
        </form>
      </CardContent>
    </Card>
  );
}

const CHECKLIST: readonly { id: string; group: string; label: string; detail: string }[] = [
  { id: "activity", group: "Fiscal", label: "Atividade aberta com CAE de comércio online (47910) e enquadramento de IVA correto", detail: "Confirma o regime (isenção art.º 53.º ou normal) com o contabilista." },
  { id: "invoicing", group: "Fiscal", label: "Fatura emitida por software certificado pela AT em cada venda", detail: "Liga o Shopify a um programa de faturação certificado." },
  { id: "oss", group: "Fiscal", label: "Controlo o limiar de 10.000 €/ano de vendas B2C para outros países da UE (OSS)", detail: "Acima do limiar aplica-se o IVA do país do cliente, declarado no balcão único OSS." },
  { id: "ioss", group: "Fiscal", label: "Envios de fora da UE até 150 € com IVA cobrado no checkout (IOSS)", detail: "Evita que o cliente pague IVA e taxas de desalfandegamento à chegada." },
  { id: "meta_invoices", group: "Fiscal", label: "Faturas da Meta Ireland, Google e TikTok guardadas e reportadas (autoliquidação)", detail: "São custos dedutíveis em contabilidade organizada." },
  { id: "regime", group: "Fiscal", label: "Avaliei regime simplificado vs. contabilidade organizada / Lda.", detail: "No simplificado, as vendas de mercadorias são tributadas a 15% da receita, sem abater ads nem COGS reais." },
  { id: "tracking", group: "Antifraude", label: "Tracking sincronizado com o gateway em menos de 48 h", detail: "Reduz disputas por \"artigo não recebido\"." },
  { id: "refunds", group: "Antifraude", label: "Política de reembolsos e direito de livre resolução de 14 dias visível na loja", detail: "Reembolsar um cliente irritado é mais barato que uma disputa (~15 € + o valor)." },
  { id: "disputes", group: "Antifraude", label: "Taxa de disputas abaixo de 0,75% (bem longe de 0,9%–1%)", detail: "A partir de ~0,9%–1% entras nos programas de monitorização da Visa/Mastercard e arriscas retenção de fundos." },
  { id: "cushion", group: "Tesouraria", label: "Colchão de liquidez ≥ 20% da faturação dos últimos 30 dias", detail: "Protege contra rolling reserves de 10%–20% durante 90–180 dias." },
  { id: "separation", group: "Tesouraria", label: "Conta da empresa separada da banca de trading", detail: "Injeções no trading só após o fecho semanal positivo e as reservas fiscais (War Chest)." },
];

function ComplianceChecklist({ initial }: { initial: Record<string, boolean> }) {
  const [checked, setChecked] = useState<Record<string, boolean>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const done = CHECKLIST.filter((c) => checked[c.id]).length;

  function toggle(id: string, value: boolean) {
    setChecked((prev) => ({ ...prev, [id]: value }));
    setError(null);
    startTransition(async () => {
      const result = await setChecklistItem(id, value);
      if (result.status === "error") {
        setChecked((prev) => ({ ...prev, [id]: !value }));
        setError(result.message);
      }
    });
  }

  const groups = [...new Set(CHECKLIST.map((c) => c.group))];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" /> Checklist de conformidade fiscal e antifraude
        </CardTitle>
        <CardDescription>
          {done}/{CHECKLIST.length} concluídos{pending ? " · a guardar…" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full transition-all", done === CHECKLIST.length ? "bg-success" : "bg-primary")} style={{ width: `${(done / CHECKLIST.length) * 100}%` }} />
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {groups.map((group) => (
          <div key={group} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
            <ul className="space-y-2">
              {CHECKLIST.filter((c) => c.group === group).map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" checked={checked[c.id] === true} onChange={(e) => toggle(c.id, e.target.checked)} />
                    <span>
                      <span className={cn(checked[c.id] && "text-muted-foreground line-through")}>{c.label}</span>
                      <span className="block text-xs text-muted-foreground">{c.detail}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EcommerceTab({ metrics, vault, checklist }: { metrics: HubMetrics; vault: HubVault; checklist: Record<string, boolean> }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <PnlCascadeCard metrics={metrics} vault={vault} />
        <div className="space-y-4">
          <TaxVaultCard metrics={metrics} vault={vault} />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" /> Enquadramento fiscal europeu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">OSS (vendas à distância na UE):</strong> até 10.000 €/ano de vendas B2C para outros países da UE aplica-se o IVA português. Acima
                disso, cobras a taxa do país do cliente (ex.: ES 21%, FR 20%) e declaras no balcão único OSS.
              </p>
              <p>
                <strong className="text-foreground">IOSS:</strong> para encomendas expedidas de fora da UE com valor até 150 €, o IVA é cobrado na venda e declarado mensalmente, e o
                cliente não paga taxas à chegada.
              </p>
              <p>
                <strong className="text-foreground">Simplificado vs. organizada:</strong> no regime simplificado (Categoria B) as vendas de mercadorias são tributadas sobre 15% da receita,
                independentemente dos custos reais. Com ads e COGS a pesarem 70%–85% da receita, a contabilidade organizada ou uma Lda. passa a compensar a partir de certos volumes,
                porque permite deduzir os custos reais.
              </p>
              <p className="text-xs">Informação geral: confirma sempre com um contabilista certificado.</p>
            </CardContent>
          </Card>
        </div>
      </div>
      <CashCycleCard metrics={metrics} vault={vault} />
      <ComplianceChecklist initial={checklist} />
    </div>
  );
}

export function KnowledgeHub({ metrics, vault, checklist }: { metrics: HubMetrics; vault: HubVault; checklist: Record<string, boolean> }) {
  const [tab, setTab] = useState<Tab>("academy");
  const tabs: { id: Tab; label: string; icon: typeof BookOpen }[] = [
    { id: "academy", label: "Academia: Amador → Pro → GOAT", icon: GraduationCap },
    { id: "governance", label: "Governança & modelos mentais", icon: Brain },
    { id: "ecommerce", label: "Contabilidade & e-commerce", icon: CheckCircle2 },
  ];
  return (
    <div className="space-y-5">
      <div role="tablist" className="inline-flex flex-wrap rounded-md border p-0.5">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn("inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium", tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {tab === "academy" ? (
        <Academy initialMastery={checklist} />
      ) : tab === "governance" ? (
        <GovernanceTab metrics={metrics} />
      ) : (
        <EcommerceTab metrics={metrics} vault={vault} checklist={checklist} />
      )}
    </div>
  );
}
