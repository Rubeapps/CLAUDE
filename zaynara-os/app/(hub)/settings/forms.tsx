"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { BusinessSettings } from "@/lib/finance/metrics";
import type { ShopifyProduct } from "@/lib/integrations/shopify";
import { saveBusinessSettings, saveProductMapping, type ActionState } from "./actions";

const initial: ActionState = { ok: true, message: "" };

function Feedback({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p role="status" className={state.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
      {state.message}
    </p>
  );
}

export function BusinessSettingsForm({ settings }: { settings: BusinessSettings }) {
  const [state, action, pending] = useActionState(saveBusinessSettings, initial);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-3">
      <div className="grid gap-2">
        <Label htmlFor="vat_mode">Regime de IVA</Label>
        <NativeSelect id="vat_mode" name="vat_mode" defaultValue={settings.vatMode}>
          <option value="exempt">Isento — art. 53.º CIVA</option>
          <option value="pt_standard">IVA português (normal)</option>
          <option value="oss">OSS (IVA do país de destino)</option>
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="vat_rate">Taxa de IVA PT (%)</Label>
        <Input id="vat_rate" name="vat_rate" type="number" step="0.01" min="0" max="30" defaultValue={settings.vatRate} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="default_shipping_mode">Envio produto + meias</Label>
        <NativeSelect id="default_shipping_mode" name="default_shipping_mode" defaultValue={settings.shippingMode}>
          <option value="together">Tudo num só envio</option>
          <option value="separate">Envios separados</option>
        </NativeSelect>
      </div>
      <div className="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Guardar
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export interface CostProductOption {
  id: string;
  name: string;
  currency: string;
  bundledExtraShipping: number | null;
  shopifyProductIds: string[];
  isPrimary: boolean;
}

export function ProductMappingForm({
  shopifyProducts,
  costProducts,
}: {
  shopifyProducts: ShopifyProduct[];
  costProducts: CostProductOption[];
}) {
  const [state, action, pending] = useActionState(saveProductMapping, initial);
  const currentFor = (shopifyId: string) => costProducts.find((c) => c.shopifyProductIds.includes(shopifyId))?.id ?? "";

  return (
    <form action={action} className="grid gap-6">
      <div className="grid gap-3">
        {shopifyProducts.map((p) => (
          <div key={p.id} className="grid gap-2 sm:grid-cols-[1fr_16rem] sm:items-center">
            <Label htmlFor={`map:${p.id}`} className="font-normal">
              {p.title}
              {p.status !== "ACTIVE" && <span className="text-xs text-muted-foreground">({p.status.toLowerCase()})</span>}
            </Label>
            <NativeSelect id={`map:${p.id}`} name={`map:${p.id}`} defaultValue={currentFor(p.id)}>
              <option value="">— Sem tabela de custos —</option>
              {costProducts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        ))}
      </div>

      {costProducts
        .filter((c) => !c.isPrimary)
        .map((c) => (
          <div key={c.id} className="grid gap-2 sm:max-w-sm">
            <Label htmlFor={`extra:${c.id}`}>
              Envio extra por unidade de &quot;{c.name}&quot; quando vai junto ({c.currency})
            </Label>
            <Input
              id={`extra:${c.id}`}
              name={`extra:${c.id}`}
              inputMode="decimal"
              placeholder="Por cotar"
              defaultValue={c.bundledExtraShipping ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              Pede este valor ao fornecedor. Vazio = assume 0 e o Dashboard marca o custo como estimativa.
            </p>
          </div>
        ))}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Guardar associações
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
