import { PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LowStockVariant } from "@/lib/integrations/shopify";

export function LowStockTable({ items, threshold }: { items: LowStockVariant[]; threshold: number }) {
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <PackageCheck className="size-4" />
        Nenhum produto ativo abaixo de {threshold} unidades.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Produto</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead className="text-right">Stock</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((v) => (
          <TableRow key={v.id}>
            <TableCell className="min-w-40 whitespace-normal">
              {v.name}
            </TableCell>
            <TableCell className="text-muted-foreground">{v.sku || "—"}</TableCell>
            <TableCell className="text-right">
              <Badge variant={v.quantity <= 0 ? "destructive" : "warning"} className="tabular-nums">
                {v.quantity <= 0 ? `Esgotado (${v.quantity})` : `${v.quantity} un.`}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
