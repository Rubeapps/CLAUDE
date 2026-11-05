export function formatCurrency(value: number, currency = "EUR", maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency, maximumFractionDigits, minimumFractionDigits: Math.min(2, maximumFractionDigits) }).format(value);
}

export function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits }).format(value);
}

export function formatPercent(value: number | null, digits = 1): string {
  return value === null ? "—" : `${value.toFixed(digits)}%`;
}

export function formatRatio(value: number | null, suffix = "x"): string {
  if (value === null) return "—";
  if (!Number.isFinite(value)) return "∞";
  return `${value.toFixed(2)}${suffix}`;
}

export function formatDateTime(iso: string | null, timeZone = getAppTimeZone()): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone }).format(new Date(iso));
}

export function formatShortDate(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${day}/${month}`;
}

export function getAppTimeZone(): string {
  return process.env.NEXT_PUBLIC_APP_TIMEZONE?.trim() || "Europe/Lisbon";
}
