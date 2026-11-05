"use client";

import { Check, ChevronDown, Copy, Download, ExternalLink, Film, Flame, Library, Link2 } from "lucide-react";
import { useActionState, useState } from "react";
import { updateAdMedia } from "@/app/(dashboard)/spy/ads/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { ActionMessage, SubmitButton } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { idleState } from "@/lib/action-state";
import { AD_TIER_LABEL, type AdTier } from "@/lib/calculations/ad-scoring";
import { cn } from "@/lib/utils";

export interface AdCardData {
  id: string;
  adArchiveId: string;
  pageName: string | null;
  pageId: string;
  caption: string | null;
  headline: string | null;
  landingPageUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  platforms: string[];
  firstActiveDate: string;
  daysActive: number;
  copies: number;
  winnerScore: number;
  isScaling: boolean;
  isActive: boolean;
  tier: AdTier;
}

const TIER_STYLE: Record<AdTier, string> = {
  WINNER_ESCALA: "border-amber-400/60 bg-amber-400/15 text-amber-300",
  WINNER_PROVAVEL: "border-primary/50 bg-primary/15 text-primary",
  ESTAVEL: "border-success/50 bg-success/15 text-success",
  TESTE: "border-border bg-secondary text-secondary-foreground",
  NOVO: "border-border text-muted-foreground",
};

function scoreColor(score: number): string {
  if (score >= 80) return "bg-amber-400";
  if (score >= 60) return "bg-primary";
  if (score >= 35) return "bg-success";
  return "bg-muted-foreground";
}

function libraryUrl(adArchiveId: string): string {
  return `https://www.facebook.com/ads/library/?id=${encodeURIComponent(adArchiveId)}`;
}

function MediaForm({ ad }: { ad: AdCardData }) {
  const [state, action] = useActionState(updateAdMedia, idleState);
  return (
    <form action={action} className="space-y-2 rounded-md border p-2">
      <input type="hidden" name="id" value={ad.id} />
      <Input name="video_url" defaultValue={ad.videoUrl ?? ""} placeholder="Link do vídeo (https://…mp4)" className="h-8 text-xs" aria-label="Link do vídeo" />
      <Input name="thumbnail_url" defaultValue={ad.thumbnailUrl ?? ""} placeholder="Link da imagem (opcional)" className="h-8 text-xs" aria-label="Link da imagem" />
      <SubmitButton size="sm" className="w-full" pendingLabel="A guardar…">
        Guardar media
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}

/** Cartão de um criativo Meta: tier, dias ativo, vídeo, Winner Score, copy e ações. */
export function AdCreativeCard({ ad }: { ad: AdCardData }) {
  const [showCopy, setShowCopy] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [copied, setCopied] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const name = ad.pageName ?? `Página ${ad.pageId}`;
  const text = [ad.headline, ad.caption].filter(Boolean).join("\n\n");

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className={cn("flex flex-col overflow-hidden rounded-lg border bg-card", !ad.isActive && "opacity-60")}>
      <header className="flex items-start justify-between gap-2 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary" aria-hidden>
            {name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={name}>
              {name}
            </p>
            <p className="text-xs text-muted-foreground">
              {ad.isActive ? `Ativo há ${ad.daysActive} ${ad.daysActive === 1 ? "dia" : "dias"}` : "Já não está ativo"} · {ad.copies} {ad.copies === 1 ? "cópia" : "cópias"}
            </p>
          </div>
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", TIER_STYLE[ad.tier])}>
          {ad.isScaling ? <Flame className="h-3 w-3" /> : null}
          {AD_TIER_LABEL[ad.tier]}
        </span>
      </header>

      <div className="relative aspect-[4/5] bg-muted">
        {ad.videoUrl && !videoFailed ? (
          <video
            controls
            playsInline
            preload="metadata"
            poster={ad.thumbnailUrl ?? undefined}
            className="h-full w-full bg-black object-contain"
            onError={() => setVideoFailed(true)}
            src={ad.videoUrl}
          />
        ) : ad.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagens externas arbitrárias
          <img src={ad.thumbnailUrl} alt={ad.headline ?? name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <Film className="h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{videoFailed ? "O link do vídeo não abriu (pode ter expirado)." : "A API da Meta não fornece o ficheiro do criativo."}</p>
            <a href={libraryUrl(ad.adArchiveId)} target="_blank" rel="noreferrer noopener" className="text-xs text-primary hover:underline">
              Ver na Meta Library
            </a>
          </div>
        )}
      </div>

      <div className="space-y-3 p-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Winner Score</span>
            <span className="font-semibold tabular-nums">{ad.winnerScore}/100</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={ad.winnerScore} aria-valuemin={0} aria-valuemax={100} aria-label="Winner Score">
            <div className={cn("h-full transition-all", scoreColor(ad.winnerScore))} style={{ width: `${ad.winnerScore}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Desde {ad.firstActiveDate}
            {ad.platforms.length > 0 ? ` · ${ad.platforms.join(", ")}` : ""}
          </p>
        </div>

        {ad.headline ? <p className="line-clamp-2 text-sm font-medium">{ad.headline}</p> : null}

        <div className="rounded-md border">
          <button type="button" onClick={() => setShowCopy(!showCopy)} className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium" aria-expanded={showCopy}>
            Copy do anúncio
            <ChevronDown className={cn("h-4 w-4 transition-transform", showCopy && "rotate-180")} />
          </button>
          {showCopy ? (
            <div className="space-y-2 border-t px-3 py-2">
              <p className="max-h-48 overflow-y-auto whitespace-pre-line text-xs text-muted-foreground">{ad.caption ?? "Sem texto."}</p>
              <Button type="button" size="sm" variant="outline" className="w-full" onClick={copyText} disabled={text.length === 0}>
                {copied ? <Check /> : <Copy />} {copied ? "Copiado" : "Copiar texto"}
              </Button>
            </div>
          ) : null}
        </div>

        {showMedia ? <MediaForm ad={ad} /> : null}
      </div>

      <footer className="mt-auto grid grid-cols-3 gap-1 border-t p-2">
        {ad.videoUrl ? (
          <a href={ad.videoUrl} download target="_blank" rel="noreferrer noopener" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <Download /> Download
          </a>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowMedia(!showMedia)} title="Colar o link do vídeo do criativo">
            <Link2 /> Vídeo
          </Button>
        )}
        {ad.landingPageUrl ? (
          <a href={ad.landingPageUrl} target="_blank" rel="noreferrer noopener" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <ExternalLink /> Oferta
          </a>
        ) : (
          <Button type="button" variant="ghost" size="sm" disabled>
            <ExternalLink /> Oferta
          </Button>
        )}
        <a href={libraryUrl(ad.adArchiveId)} target="_blank" rel="noreferrer noopener" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <Library /> Library
        </a>
      </footer>
      {ad.videoUrl ? (
        <button type="button" onClick={() => setShowMedia(!showMedia)} className="border-t px-2 py-1 text-left text-[11px] text-muted-foreground hover:text-foreground">
          Editar media
        </button>
      ) : null}
    </article>
  );
}
