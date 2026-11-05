"use client";

import { BookMarked, Check, Crown, GraduationCap, Lightbulb, ListChecks, Rocket, Sprout, Target } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { setChecklistItem } from "@/app/(dashboard)/knowledge/actions";
import { Button } from "@/components/ui/button";
import { ACADEMY, LEVEL_LABEL, masteryKey, type AcademyArea, type AcademyLevel, type AcademyLevelId } from "@/lib/knowledge/academy";
import { cn } from "@/lib/utils";

const LEVEL_ORDER: readonly AcademyLevelId[] = ["amador", "pro", "goat"];

const LEVEL_STYLE: Record<AcademyLevelId, { icon: typeof Sprout; active: string; badge: string }> = {
  amador: { icon: Sprout, active: "border-success bg-success/15 text-success", badge: "bg-success/15 text-success" },
  pro: { icon: Rocket, active: "border-primary bg-primary/15 text-primary", badge: "bg-primary/15 text-primary" },
  goat: { icon: Crown, active: "border-amber-400 bg-amber-400/15 text-amber-300", badge: "bg-amber-400/15 text-amber-300" },
};

/** Nível mais alto dominado numa área (os níveis contam por ordem). */
function highestMastered(area: AcademyArea, mastered: Record<string, boolean>): AcademyLevelId | null {
  let best: AcademyLevelId | null = null;
  for (const level of LEVEL_ORDER) {
    if (mastered[masteryKey(area.id, level)]) best = level;
  }
  return best;
}

function Section({ icon: Icon, title, items, ordered }: { icon: typeof Lightbulb; title: string; items: string[]; ordered?: boolean }) {
  const List = ordered ? "ol" : "ul";
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </p>
      <List className={cn("space-y-1.5 pl-5 text-sm", ordered ? "list-decimal" : "list-disc")}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </List>
    </div>
  );
}

function LevelView({ area, level, mastered, onToggle, pending }: { area: AcademyArea; level: AcademyLevel; mastered: boolean; onToggle: () => void; pending: boolean }) {
  const style = LEVEL_STYLE[level.id];
  return (
    <div className="space-y-5 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold uppercase", style.badge)}>
            <style.icon className="h-3.5 w-3.5" /> {LEVEL_LABEL[level.id]}
          </span>
          <p className="text-lg font-semibold">{level.mindset}</p>
        </div>
        <Button type="button" size="sm" variant={mastered ? "success" : "outline"} onClick={onToggle} disabled={pending} aria-pressed={mastered}>
          {mastered ? <Check /> : <GraduationCap />} {mastered ? "Dominado" : "Marcar como dominado"}
        </Button>
      </div>

      <Section icon={Lightbulb} title="Princípios dos melhores" items={level.principles} />
      <div className="grid gap-5 md:grid-cols-2">
        <Section icon={ListChecks} title="Faz esta semana" items={level.actions} ordered />
        <Section icon={Target} title="O que medir" items={level.metrics} />
      </div>
      {level.inApex ? (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <span className="font-semibold text-primary">No Apex OS:</span> {level.inApex}
        </p>
      ) : null}
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <BookMarked className="h-3.5 w-3.5" /> Fontes
        </p>
        <ul className="flex flex-wrap gap-2">
          {level.sources.map((s) => (
            <li key={`${s.who}-${s.work}`} className="rounded-md border px-2 py-1 text-xs">
              <span className="font-medium">{s.who}</span> — <span className="italic text-muted-foreground">{s.work}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[11px] text-muted-foreground">Área: {area.title}</p>
    </div>
  );
}

/**
 * Academia: cada área do negócio em 3 níveis (Amador/Iniciante → Pro → GOAT),
 * com os princípios dos melhores operadores, ações, métricas e fontes.
 * O progresso fica guardado no checklist do cofre (por utilizador).
 */
export function Academy({ initialMastery }: { initialMastery: Record<string, boolean> }) {
  const [areaId, setAreaId] = useState<string>(ACADEMY[0]?.id ?? "");
  const [levelId, setLevelId] = useState<AcademyLevelId>("amador");
  const [mastered, setMastered] = useState<Record<string, boolean>>(initialMastery);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const area = ACADEMY.find((a) => a.id === areaId) ?? ACADEMY[0];
  const level = area?.levels.find((l) => l.id === levelId) ?? area?.levels[0];

  const stats = useMemo(() => {
    const total = ACADEMY.length * LEVEL_ORDER.length;
    const done = ACADEMY.reduce((sum, a) => sum + LEVEL_ORDER.filter((l) => mastered[masteryKey(a.id, l)]).length, 0);
    const goat = ACADEMY.filter((a) => mastered[masteryKey(a.id, "goat")]).length;
    return { total, done, goat };
  }, [mastered]);

  if (!area || !level) return null;

  function toggle() {
    if (!area || !level) return;
    const key = masteryKey(area.id, level.id);
    const next = !mastered[key];
    setMastered((prev) => ({ ...prev, [key]: next }));
    setError(null);
    startTransition(async () => {
      const result = await setChecklistItem(key, next);
      if (result.status === "error") {
        setMastered((prev) => ({ ...prev, [key]: !next }));
        setError(result.message);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progresso na Academia</span>
            <span className="font-semibold tabular-nums">
              {stats.done}/{stats.total} níveis · {stats.goat} áreas em GOAT
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-gradient-to-r from-success via-primary to-amber-400 transition-all" style={{ width: `${(stats.done / stats.total) * 100}%` }} />
          </div>
        </div>
        <p className="max-w-md text-xs text-muted-foreground">
          Começa pelo nível Amador de cada área. Só marcas como dominado quando já aplicas as ações e medes as métricas, não quando acabas de ler.
        </p>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <nav aria-label="Áreas" className="space-y-1">
          {ACADEMY.map((a) => {
            const best = highestMastered(a, mastered);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAreaId(a.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  a.id === area.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span className="truncate">{a.title}</span>
                {best ? <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", LEVEL_STYLE[best].badge)}>{best === "amador" ? "Amador" : best === "pro" ? "Pro" : "GOAT"}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{area.title}</h2>
            <p className="text-sm text-muted-foreground">{area.why}</p>
          </div>
          <div role="tablist" className="grid grid-cols-3 gap-2">
            {LEVEL_ORDER.map((id) => {
              const style = LEVEL_STYLE[id];
              const done = mastered[masteryKey(area.id, id)] === true;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={id === level.id}
                  onClick={() => setLevelId(id)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-semibold uppercase tracking-wide sm:text-sm",
                    id === level.id ? style.active : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <style.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{LEVEL_LABEL[id]}</span>
                  <span className="sm:hidden">{id === "amador" ? "Amador" : id === "pro" ? "Pro" : "GOAT"}</span>
                  {done ? <Check className="h-3.5 w-3.5" /> : null}
                </button>
              );
            })}
          </div>
          <LevelView area={area} level={level} mastered={mastered[masteryKey(area.id, level.id)] === true} onToggle={toggle} pending={pending} />
        </div>
      </div>
    </div>
  );
}
