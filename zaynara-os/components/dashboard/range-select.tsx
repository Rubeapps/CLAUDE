import Link from "next/link";
import { RANGE_OPTIONS, type RangeDays } from "@/lib/dashboard/load";
import { cn } from "@/lib/utils";

export function RangeSelect({ current }: { current: RangeDays }) {
  return (
    <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Período">
      {RANGE_OPTIONS.map((days) => (
        <Link
          key={days}
          href={`/dashboard?days=${days}`}
          aria-current={days === current ? "true" : undefined}
          className={cn(
            "rounded-sm px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground",
            days === current && "bg-secondary font-medium text-foreground",
          )}
        >
          {days} dias
        </Link>
      ))}
    </div>
  );
}
