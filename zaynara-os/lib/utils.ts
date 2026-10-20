import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });

export function formatEur(value: number) {
  return eur.format(value);
}

export function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** "2026-10-20" → "20/10" */
export function formatShortDate(isoDate: string) {
  const [, m, d] = isoDate.split("-");
  return `${d}/${m}`;
}
