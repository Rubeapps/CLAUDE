export type AcademyLevelId = "amador" | "pro" | "goat";

export interface AcademySource {
  /** Pessoa ou organização. */
  who: string;
  /** Livro, método ou referência. */
  work: string;
}

export interface AcademyLevel {
  id: AcademyLevelId;
  /** Frase-síntese do nível. */
  mindset: string;
  principles: string[];
  /** Ações concretas para esta semana. */
  actions: string[];
  /** O que medir neste nível. */
  metrics: string[];
  /** Onde aplicar dentro do Apex OS (opcional). */
  inApex?: string;
  sources: AcademySource[];
}

export interface AcademyArea {
  id: string;
  title: string;
  /** Porque é que esta área decide o negócio. */
  why: string;
  levels: [AcademyLevel, AcademyLevel, AcademyLevel];
}

export const LEVEL_LABEL: Record<AcademyLevelId, string> = {
  amador: "Amador / Iniciante",
  pro: "Pro",
  goat: "GOAT",
};
