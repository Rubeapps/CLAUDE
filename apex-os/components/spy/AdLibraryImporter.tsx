"use client";

import { Bookmark, Check, ClipboardPaste, Copy, ExternalLink, MousePointerClick, Upload } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { importLibraryAds } from "@/app/(dashboard)/spy/ads/actions";
import { Button } from "@/components/ui/button";
import { ActionMessage, SubmitButton } from "@/components/ui/form-status";
import { Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleState } from "@/lib/action-state";
import type { AdTargetOption } from "@/lib/data/spy-ads";
import { adLibraryPageUrl, detectPageIdInput, parseLibraryPayload } from "@/lib/spy/ad-library-import";
import { bookmarkletSource, buildBookmarklet } from "@/lib/spy/bookmarklet";
import { cn } from "@/lib/utils";

type Preview = { kind: "empty" } | { kind: "ok"; cards: number; url: string } | { kind: "pageId"; pageId: string } | { kind: "error"; message: string };

/**
 * Importação sem token: o botão "Enviar para o Apex" (bookmarklet) copia os anúncios visíveis
 * na Meta Ad Library e aqui o utilizador cola e importa.
 */
export function AdLibraryImporter({ targets, autoOpen }: { targets: AdTargetOption[]; autoOpen: boolean }) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(autoOpen);
  const [origin, setOrigin] = useState("");
  const [payload, setPayload] = useState("");
  const [copied, setCopied] = useState(false);
  const [state, action] = useActionState(importLibraryAds, idleState);

  // O React bloqueia href="javascript:…" em JSX; o link do favorito é definido diretamente no DOM.
  useEffect(() => {
    const o = window.location.origin;
    setOrigin(o);
    linkRef.current?.setAttribute("href", buildBookmarklet(o));
  }, [open]);

  useEffect(() => {
    if (state.status === "success") setPayload("");
  }, [state]);

  const preview: Preview = (() => {
    if (payload.trim() === "") return { kind: "empty" };
    const pageId = detectPageIdInput(payload);
    if (pageId) return { kind: "pageId", pageId };
    const r = parseLibraryPayload(payload);
    return r.ok ? { kind: "ok", cards: r.payload.cards.length, url: r.payload.url } : { kind: "error", message: r.error };
  })();

  async function readClipboard() {
    try {
      setPayload(await navigator.clipboard.readText());
    } catch {
      setPayload("");
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(bookmarkletSource(origin));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Upload /> Importar da Ad Library (sem token)
      </Button>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-primary/40 bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">Importar da Meta Ad Library — grátis, sem token</p>
          <p className="text-xs text-muted-foreground">Lê os anúncios que estás a ver no teu browser, incluindo os links dos vídeos. Só guarda texto e links, sem ficheiros.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Fechar
        </Button>
      </div>

      <ol className="grid gap-3 text-sm md:grid-cols-4">
        <li className="space-y-2 rounded-md border p-3">
          <p className="flex items-center gap-1.5 font-medium">
            <Bookmark className="h-4 w-4 text-primary" /> 1. Instala o botão
          </p>
          <p className="text-xs text-muted-foreground">Arrasta este botão para a barra de favoritos (Ctrl+Shift+B mostra a barra). Só é preciso uma vez.</p>
          <a
            ref={linkRef}
            onClick={(e) => e.preventDefault()}
            draggable
            className="inline-flex cursor-grab items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground active:cursor-grabbing"
          >
            <Upload className="h-3.5 w-3.5" /> Enviar para o Apex
          </a>
          <button type="button" onClick={copyCode} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "Código copiado" : "Ou copia o código para criares o favorito à mão"}
          </button>
        </li>
        <li className="space-y-1 rounded-md border p-3">
          <p className="flex items-center gap-1.5 font-medium">
            <MousePointerClick className="h-4 w-4 text-primary" /> 2. Abre a marca
          </p>
          <p className="text-xs text-muted-foreground">
            Em{" "}
            <a href="https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL" target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
              facebook.com/ads/library
            </a>
            , pesquisa o concorrente e abre a página dele. Faz scroll para carregar todos os anúncios que quiseres.
          </p>
        </li>
        <li className="space-y-1 rounded-md border p-3">
          <p className="flex items-center gap-1.5 font-medium">
            <Upload className="h-4 w-4 text-primary" /> 3. Carrega no botão
          </p>
          <p className="text-xs text-muted-foreground">Com a página da marca aberta, carrega em &quot;Enviar para o Apex&quot; nos favoritos. Os anúncios são copiados e o Apex abre noutro separador.</p>
        </li>
        <li className="space-y-1 rounded-md border p-3">
          <p className="flex items-center gap-1.5 font-medium">
            <ClipboardPaste className="h-4 w-4 text-primary" /> 4. Cola e importa
          </p>
          <p className="text-xs text-muted-foreground">Cola em baixo (Ctrl+V) e carrega em Importar. O Winner Score é calculado na hora.</p>
        </li>
      </ol>

      <form action={action} className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="library-payload">Conteúdo copiado pelo botão</Label>
            <button type="button" onClick={readClipboard} className="text-xs text-primary hover:underline">
              Colar do clipboard
            </button>
          </div>
          <Textarea
            id="library-payload"
            name="payload"
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            placeholder='Cola aqui (Ctrl+V). Começa por {"v":1,"source":"apex-ad-library",…'
            className="h-24 font-mono text-[11px]"
            spellCheck={false}
          />
          {preview.kind === "ok" ? (
            <p className="text-xs text-success">
              {preview.cards} anúncios prontos a importar
              {preview.url.includes("view_all_page_id") ? " (com Page ID)" : " · sem Page ID no URL: escolhe uma loja ou fica agrupado pelo nome da página"}.
            </p>
          ) : preview.kind === "pageId" ? (
            <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-xs">
              <p>
                Isto é o <strong>Page ID {preview.pageId}</strong>, não o conteúdo do botão. Abre a Ad Library dessa página, faz scroll, carrega no favorito{" "}
                <strong>&quot;Enviar para o Apex&quot;</strong> e cola aqui o que ele copiar.
              </p>
              <a
                href={adLibraryPageUrl(preview.pageId)}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Abrir anúncios desta página na Ad Library
              </a>
            </div>
          ) : preview.kind === "error" ? (
            <p className="text-xs text-destructive">{preview.message}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="library-target">Associar a uma loja (opcional)</Label>
            <Select id="library-target" name="target_id" defaultValue="" className="w-64">
              <option value="">— nenhuma —</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.storeName}
                </option>
              ))}
            </Select>
          </div>
          <SubmitButton pendingLabel="A importar…" disabled={preview.kind !== "ok"} className={cn(preview.kind === "ok" && "animate-none")}>
            <Upload /> Importar anúncios
          </SubmitButton>
        </div>
        <ActionMessage state={state} />
        <p className="text-[11px] text-muted-foreground">
          Os links de vídeo do Facebook expiram ao fim de algum tempo: descarrega os criativos que te interessam logo a seguir, ou volta a importar para renovar os links. Se a Meta
          mudar o site e deixar de funcionar, avisa-me para ajustar o leitor.
        </p>
      </form>
    </div>
  );
}
