-- =============================================================================
-- Zaynara OS — Definições do negócio (IVA, modo de envio)
-- =============================================================================

do $$ begin
  -- pt_standard: abaixo dos 10 000 € de vendas à distância na UE → IVA português
  --              em todas as vendas (art. 59.º-A/59.º-B do RITI)
  -- exempt:      isento ao abrigo do art. 53.º do CIVA (sem IVA liquidado)
  -- oss:         acima do limiar → IVA do país de destino via OSS
  create type public.vat_mode as enum ('pt_standard', 'exempt', 'oss');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.shipping_mode as enum ('together', 'separate');
exception when duplicate_object then null; end $$;

create table if not exists public.business_settings (
  user_id               uuid primary key default auth.uid()
                          references auth.users (id) on delete cascade,
  vat_mode              public.vat_mode not null default 'pt_standard',
  vat_rate              numeric(5, 2) not null default 23.00 check (vat_rate between 0 and 30),
  -- Modo usado no Dashboard; o outro cenário é sempre calculado para comparação.
  default_shipping_mode public.shipping_mode not null default 'together',
  primary_product_key   text not null default 'principal',
  updated_at            timestamptz not null default now()
);

create trigger business_settings_set_updated_at
  before update on public.business_settings
  for each row execute function extensions.moddatetime(updated_at);

-- Envio extra por unidade quando este produto vai NO MESMO pacote do produto
-- principal (na moeda do produto). NULL = ainda sem cotação do fornecedor →
-- o cálculo assume 0 e marca o resultado como estimativa.
alter table public.cost_products
  add column if not exists bundled_extra_shipping numeric(10, 2)
    check (bundled_extra_shipping >= 0);

alter table public.business_settings enable row level security;

create policy "business_settings_select_own" on public.business_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "business_settings_insert_own" on public.business_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "business_settings_update_own" on public.business_settings
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
