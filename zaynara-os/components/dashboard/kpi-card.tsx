import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  hint,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  tone?: "positive" | "negative";
}) {
  return (
    <Card className={cn("gap-2 py-4", emphasis && "border-foreground/20")}>
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            "text-xl font-semibold tabular-nums tracking-tight",
            emphasis && "text-2xl",
            tone === "negative" && "text-destructive",
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
      {hint && <CardContent className="px-4 text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}
