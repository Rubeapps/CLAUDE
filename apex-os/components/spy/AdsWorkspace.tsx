"use client";

import { Loader2, Megaphone, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateAdWinnerScore } from "@/lib/calculations/ad-scoring";
import type { SpyAdCreativeRow } from "@/lib/database.types";
import type { AdTargetOption } from "@/lib/data/spy-ads";
import { formatDateTime } from "@/lib/format";
import { AdCreativeCard, type AdCardData } from "./AdCreativeCard";
import { AdLibraryImporter } from "./AdLibraryImporter";

type SortKey = "score" | "recent" | "days" | "copies";
type TierFilter = "all" | "winners" | "scaling" | "inactive";

const syncResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    result: z.object({
      pageName: z.string().nullable(),
      fetchedAds: z.number(),
      creatives: z.number(),
      newCreatives: z.number(),
      updatedCreatives: z.number(),
      deactivated: z.number(),
      scaling: z.number(),
    }),
  }),
  z.object({ error: z.string(), message: z.string() }),
]);

type SyncStatus = { kind: "idle" } | { kind: "success"; message: string } | { kind: "error"; message: string };

function toCard(row: SpyAdCreativeRow, now: Date): AdCardData {
  // Recalcula com a data atual para os dias/score não ficarem parados entre sincronizações.
  const score = calculateAdWinnerScore({ firstActiveDate: row.first_active_date, activeCopiesCount: row.active_copies_count }, now);
  return {
    id: row.id,
    adArchiveId: row.ad_archive_id,
    pageName: row.page_name,
    pageId: row.page_id,
    caption: row.ad_caption,
    headline: row.headline,
    landingPageUrl: row.landing_page_url,
    videoUrl: row.video_url,
    thumbnailUrl: row.thumbnail_url,
    platforms: row.ad_platforms ?? [],
    firstActiveDate: row.first_active_date,
    daysActive: row.is_active === false ? row.days_active : score.daysActive,
    copies: row.active_copies_count,
    winnerScore: row.is_active === false ? Number(row.winner_score) : score.winnerScore,
    isScaling: row.is_active === false ? row.is_scaling === true : score.isScaling,
    isActive: row.is_active !== false,
    tier: score.tier,
  };
}

export function AdsGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="A carregar anúncios">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse overflow-hidden rounded-lg border bg-card">
          <div className="flex items-center gap-2 p-3">
            <div className="h-8 w-8 rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-2/3 rounded bg-muted" />
              <div className="h-2.5 w-1/3 rounded bg-muted" />
            </div>
          </div>
          <div className="aspect-[4/5] bg-muted" />
          <div className="space-y-2 p-3">
            <div className="h-2 rounded bg-muted" />
            <div className="h-3 w-4/5 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdsWorkspace({
  ads,
  targets,
  lastSyncAt,
  metaConfigured,
  autoOpenImport,
}: {
  ads: SpyAdCreativeRow[];
  targets: AdTargetOption[];
  lastSyncAt: string | null;
  metaConfigured: boolean;
  autoOpenImport: boolean;
}) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<SyncStatus>({ kind: "idle" });
  const [pageInput, setPageInput] = useState("");
  const [targetId, setTargetId] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [filter, setFilter] = useState<TierFilter>("all");
  const [pageFilter, setPageFilter] = useState("all");

  const busy = syncing || isRefreshing;
  const selectedTarget = targets.find((t) => t.id === targetId) ?? null;

  const cards = useMemo(() => {
    const now = new Date();
    return ads.map((row) => ({ card: toCard(row, now), createdAt: row.created_at ?? "" }));
  }, [ads]);

  const pages = useMemo(() => {
    const map = new Map<string, string>();
    for (const { card } of cards) map.set(card.pageId, card.pageName ?? card.pageId);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [cards]);

  const visible = useMemo(() => {
    const filtered = cards.filter(({ card }) => {
      if (pageFilter !== "all" && card.pageId !== pageFilter) return false;
      if (filter === "inactive") return !card.isActive;
      if (!card.isActive) return false;
      if (filter === "winners") return card.tier === "WINNER_PROVAVEL" || card.tier === "WINNER_ESCALA";
      if (filter === "scaling") return card.isScaling;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      switch (sort) {
        case "recent":
          return b.card.firstActiveDate.localeCompare(a.card.firstActiveDate) || b.createdAt.localeCompare(a.createdAt);
        case "days":
          return b.card.daysActive - a.card.daysActive;
        case "copies":
          return b.card.copies - a.card.copies || b.card.winnerScore - a.card.winnerScore;
        default:
          return b.card.winnerScore - a.card.winnerScore || b.card.copies - a.card.copies;
      }
    });
    return sorted.map(({ card }) => card);
  }, [cards, sort, filter, pageFilter]);

  async function sync() {
    const pageId = pageInput.trim();
    if (!pageId && !selectedTarget?.metaPageId) {
      setStatus({ kind: "error", message: selectedTarget ? "Esta loja não tem Meta Page ID. Escreve-o acima ou adiciona-o em Spy Engine." : "Escreve um Page ID ou escolhe uma loja." });
      return;
    }
    setSyncing(true);
    setStatus({ kind: "idle" });
    try {
      const res = await fetch("/api/spy/ads/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(pageId ? { pageId } : {}), ...(targetId ? { targetId } : {}) }),
      });
      const parsed = syncResponseSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) {
        setStatus({ kind: "error", message: `Resposta inesperada do servidor (HTTP ${res.status}).` });
      } else if ("error" in parsed.data) {
        setStatus({ kind: "error", message: parsed.data.message });
      } else {
        const r = parsed.data.result;
        setStatus({
          kind: "success",
          message: `${r.pageName ?? "Página"}: ${r.fetchedAds} anúncios ativos → ${r.creatives} criativos (${r.newCreatives} novos, ${r.updatedCreatives} atualizados, ${r.scaling} em escala${r.deactivated > 0 ? `, ${r.deactivated} desativados` : ""}).`,
        });
        startTransition(() => router.refresh());
      }
    } catch {
      setStatus({ kind: "error", message: "Falha de rede ao sincronizar." });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-5">
      <AdLibraryImporter targets={targets} autoOpen={autoOpenImport || !metaConfigured} />
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">Sincronização automática pela API oficial da Meta</p>
        {!metaConfigured ? (
          <p className="rounded-md border border-amber-400/50 bg-amber-400/10 p-2 text-xs text-amber-300">
            Opcional: sem <code>META_ACCESS_TOKEN</code> na Vercel esta sincronização não funciona. Usa a importação pelo botão acima, que é grátis e não precisa de token.
          </p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_auto] md:items-end">
          <div className="space-y-1">
            <Label htmlFor="page-id">Meta Page ID ou link da Ad Library</Label>
            <Input id="page-id" value={pageInput} onChange={(e) => setPageInput(e.target.value)} placeholder="ex.: 123456789012345 ou …/ads/library/?view_all_page_id=…" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="target">Associar a uma loja (opcional)</Label>
            <Select id="target" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">— nenhuma —</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.storeName}
                  {t.metaPageId ? ` (${t.metaPageId})` : " (sem Page ID)"}
                </option>
              ))}
            </Select>
          </div>
          <Button type="button" onClick={sync} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {syncing ? "A sincronizar…" : "Sincronizar anúncios"}
          </Button>
        </div>
        {status.kind !== "idle" ? <p className={status.kind === "error" ? "text-xs text-destructive" : "text-xs text-success"}>{status.message}</p> : null}
        <p className="text-xs text-muted-foreground">
          Último sync: {formatDateTime(lastSyncAt)} · As lojas do Spy Engine com Meta Page ID também são sincronizadas pelo cron.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="sort">Ordenar por</Label>
          <Select id="sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="w-48">
            <option value="score">Maior Winner Score</option>
            <option value="recent">Mais recente</option>
            <option value="days">Mais dias ativo</option>
            <option value="copies">Mais cópias</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tier">Filtro</Label>
          <Select id="tier" value={filter} onChange={(e) => setFilter(e.target.value as TierFilter)} className="w-48">
            <option value="all">Todos os ativos</option>
            <option value="winners">Apenas winners</option>
            <option value="scaling">Apenas em escala</option>
            <option value="inactive">Já não ativos</option>
          </Select>
        </div>
        {pages.length > 1 ? (
          <div className="space-y-1">
            <Label htmlFor="page-filter">Página</Label>
            <Select id="page-filter" value={pageFilter} onChange={(e) => setPageFilter(e.target.value)} className="w-56">
              <option value="all">Todas as páginas</option>
              {pages.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <p className="ml-auto text-xs text-muted-foreground">{visible.length} criativos</p>
      </div>

      {busy ? (
        <AdsGridSkeleton />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={ads.length === 0 ? "Ainda sem anúncios" : "Nenhum criativo com estes filtros"}
          description={ads.length === 0 ? "Escreve o Page ID de uma marca concorrente e carrega em Sincronizar anúncios." : "Muda o filtro ou a ordenação para ver mais criativos."}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((card) => (
            <AdCreativeCard key={card.id} ad={card} />
          ))}
        </div>
      )}
    </div>
  );
}
