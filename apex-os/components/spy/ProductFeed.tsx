"use client";

import { ArrowDownRight, ArrowUpRight, Flame, ImageOff, PackageX, Sparkles, Tags } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import type { FeedPriceChange, FeedProduct } from "@/lib/data/spy";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "new" | "prices" | "scaling" | "oos";

function productUrl(p: FeedProduct): string {
  return `${p.storeUrl}/products/${encodeURIComponent(p.handle)}`;
}

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted">
        <ImageOff className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }
  const sized = src.includes("cdn.shopify.com") ? `${src}${src.includes("?") ? "&" : "?"}width=120` : src;
  // eslint-disable-next-line @next/next/no-img-element -- imagens de lojas externas arbitrárias
  return <img src={sized} alt={alt} loading="lazy" className="h-14 w-14 shrink-0 rounded-md object-cover" />;
}

function ProductLine({ product, right, meta }: { product: FeedProduct; right: ReactNode; meta: string }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Thumb src={product.image_url} alt={product.title} />
      <div className="min-w-0 flex-1">
        <a href={productUrl(product)} target="_blank" rel="noreferrer noopener" className="line-clamp-1 text-sm font-medium hover:underline">
          {product.title}
        </a>
        <p className="text-xs text-muted-foreground">
          {product.storeName} · {meta}
        </p>
      </div>
      <div className="text-right">{right}</div>
    </li>
  );
}

export function ProductFeed({
  newest,
  priceChanges,
  outOfStock,
  scaling,
  stores,
}: {
  newest: FeedProduct[];
  priceChanges: FeedPriceChange[];
  outOfStock: FeedProduct[];
  scaling: FeedProduct[];
  stores: string[];
}) {
  const [tab, setTab] = useState<Tab>("new");
  const [store, setStore] = useState<string>("all");

  const filtered = useMemo(() => {
    const match = (p: FeedProduct) => store === "all" || p.storeName === store;
    return {
      new: newest.filter(match),
      prices: priceChanges.filter((c) => match(c.product)),
      oos: outOfStock.filter(match),
      scaling: scaling.filter(match),
    };
  }, [newest, priceChanges, outOfStock, scaling, store]);

  const tabs: { id: Tab; label: string; count: number; icon: typeof Sparkles }[] = [
    { id: "new", label: "Novos", count: filtered.new.length, icon: Sparkles },
    { id: "prices", label: "Preços", count: filtered.prices.length, icon: Tags },
    { id: "scaling", label: "A escalar", count: filtered.scaling.length, icon: Flame },
    { id: "oos", label: "Ruturas", count: filtered.oos.length, icon: PackageX },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-md border p-0.5">
          {tabs.map(({ id, label, count, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn("inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium", tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <Icon className="h-3.5 w-3.5" /> {label} <span className="opacity-70">{count}</span>
            </button>
          ))}
        </div>
        <Select value={store} onChange={(e) => setStore(e.target.value)} className="w-48" aria-label="Filtrar por loja">
          <option value="all">Todas as lojas</option>
          {stores.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      {tab === "new" &&
        (filtered.new.length === 0 ? (
          <EmptyState icon={Sparkles} title="Sem produtos" description="Adiciona uma loja e corre o primeiro scan." />
        ) : (
          <ul className="divide-y">
            {filtered.new.map((p) => (
              <ProductLine
                key={p.id}
                product={p}
                meta={`publicado ${formatDateTime(p.published_at)}`}
                right={
                  <div>
                    <p className="text-sm font-semibold tabular-nums">{formatNumber(p.current_price)}</p>
                    {p.compare_at_price !== null && p.compare_at_price > p.current_price ? (
                      <p className="text-xs tabular-nums text-muted-foreground line-through">{formatNumber(p.compare_at_price)}</p>
                    ) : null}
                    {!p.is_available ? <Badge variant="destructive">sem stock</Badge> : null}
                    {p.is_scaling ? <Badge variant="default">a escalar</Badge> : null}
                  </div>
                }
              />
            ))}
          </ul>
        ))}

      {tab === "prices" &&
        (filtered.prices.length === 0 ? (
          <EmptyState icon={Tags} title="Sem alterações de preço" description="As alterações aparecem aqui a partir do segundo scan de cada loja." />
        ) : (
          <ul className="divide-y">
            {filtered.prices.map((c) => {
              const down = c.newPrice < c.oldPrice;
              const pct = c.oldPrice > 0 ? ((c.newPrice - c.oldPrice) / c.oldPrice) * 100 : 0;
              return (
                <ProductLine
                  key={c.id}
                  product={c.product}
                  meta={`detetado ${formatDateTime(c.detectedAt)}`}
                  right={
                    <div className={cn("flex items-center gap-1 text-sm tabular-nums", down ? "text-success" : "text-destructive")}>
                      {down ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      <span className="text-muted-foreground line-through">{formatNumber(c.oldPrice)}</span>
                      <span className="font-semibold">{formatNumber(c.newPrice)}</span>
                      <span className="text-xs">({pct > 0 ? "+" : ""}{pct.toFixed(1)}%)</span>
                    </div>
                  }
                />
              );
            })}
          </ul>
        ))}

      {tab === "scaling" &&
        (filtered.scaling.length === 0 ? (
          <EmptyState icon={Flame} title="Nenhum produto a escalar" description="Produtos com tag best-seller ou movimento de stock nas últimas 72h aparecem aqui." />
        ) : (
          <ul className="divide-y">
            {filtered.scaling.map((p) => (
              <ProductLine
                key={p.id}
                product={p}
                meta={`sinal ${formatDateTime(p.scaling_detected_at)} · ${p.available_variants ?? "?"} variantes disponíveis`}
                right={
                  <div className="space-y-1">
                    <p className="text-sm font-semibold tabular-nums">{formatNumber(p.current_price)}</p>
                    <Badge variant="default">
                      <Flame className="mr-1 h-3 w-3" /> a escalar
                    </Badge>
                  </div>
                }
              />
            ))}
          </ul>
        ))}

      {tab === "oos" &&
        (filtered.oos.length === 0 ? (
          <EmptyState icon={PackageX} title="Sem ruturas" description="Produtos com todas as variantes indisponíveis aparecem aqui." />
        ) : (
          <ul className="divide-y">
            {filtered.oos.map((p) => (
              <ProductLine key={p.id} product={p} meta={`visto ${formatDateTime(p.last_updated_at)}`} right={<Badge variant="destructive">sem stock</Badge>} />
            ))}
          </ul>
        ))}
    </div>
  );
}
