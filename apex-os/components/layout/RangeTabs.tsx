import Link from "next/link";
import { cn } from "@/lib/utils";

export function RangeTabs({ basePath, current, options }: { basePath: string; current: number; options: readonly number[] }) {
  return (
    <div className="inline-flex rounded-md border p-0.5">
      {options.map((days) => (
        <Link
          key={days}
          href={`${basePath}?range=${days}`}
          className={cn("rounded px-3 py-1 text-xs font-medium", days === current ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {days}d
        </Link>
      ))}
    </div>
  );
}
