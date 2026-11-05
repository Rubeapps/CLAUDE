import { ACADEMY_PART_1 } from "./academy-part1.ts";
import { ACADEMY_PART_2 } from "./academy-part2.ts";
import type { AcademyArea, AcademyLevelId } from "./academy-types.ts";

export * from "./academy-types.ts";

/** Todas as áreas da Academia (Amador → Pro → GOAT). */
export const ACADEMY: AcademyArea[] = [...ACADEMY_PART_1, ...ACADEMY_PART_2];

/** Chave usada no checklist JSONB do cofre para guardar "nível dominado". */
export function masteryKey(areaId: string, level: AcademyLevelId): string {
  return `acad_${areaId}_${level}`;
}
