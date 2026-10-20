-- =============================================================================
-- Zaynara OS — Custos de fornecedor por país e quantidade (COGS + portes)
-- A Shopify não sabe o custo real por país: o fornecedor cobra produto + envio
-- e o envio varia com o país de destino e o nº de unidades. Esta tabela é a
-- fonte de verdade para o COGS e os Portes do Dashboard.
-- =============================================================================

create table if not exists public.cost_products (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid()
                        references auth.users (id) on delete cascade,
  key                 text not null,                 -- ex: 'principal', 'meias'
  name                text not null,
  currency            char(3) not null default 'EUR',-- moeda em que o fornecedor fatura
  -- IDs de produto da Shopify (gid://shopify/Product/...) que usam esta tabela.
  shopify_product_ids text[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, key)
);

create trigger cost_products_set_updated_at
  before update on public.cost_products
  for each row execute function extensions.moddatetime(updated_at);

create table if not exists public.supplier_rates (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid()
                   references auth.users (id) on delete cascade,
  product_id     uuid not null references public.cost_products (id) on delete cascade,
  country_code   char(2) not null check (country_code ~ '^[A-Z]{2}$'),  -- ISO 3166-1
  quantity       smallint not null check (quantity between 1 and 20),
  supplier       text not null,                    -- ex: 'Yun', 'EQ'
  product_cost   numeric(10, 2) not null check (product_cost >= 0),
  shipping_cost  numeric(10, 2) not null check (shipping_cost >= 0),
  total_cost     numeric(10, 2) generated always as (product_cost + shipping_cost) stored,
  -- Histórico de preços: o lucro de uma encomenda antiga usa a tabela em vigor
  -- na data da encomenda, não a de hoje.
  valid_from     date not null default public.today_lisbon(),
  created_at     timestamptz not null default now(),
  unique (product_id, country_code, quantity, valid_from)
);

create index if not exists supplier_rates_lookup_idx
  on public.supplier_rates (product_id, country_code, quantity, valid_from desc);

alter table public.cost_products  enable row level security;
alter table public.supplier_rates enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['cost_products', 'supplier_rates']
  loop
    execute format($p$
      create policy "%1$s_select_own" on public.%1$I
        for select to authenticated using ((select auth.uid()) = user_id)
    $p$, t);
    execute format($p$
      create policy "%1$s_insert_own" on public.%1$I
        for insert to authenticated with check ((select auth.uid()) = user_id)
    $p$, t);
    execute format($p$
      create policy "%1$s_update_own" on public.%1$I
        for update to authenticated
        using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)
    $p$, t);
    execute format($p$
      create policy "%1$s_delete_own" on public.%1$I
        for delete to authenticated using ((select auth.uid()) = user_id)
    $p$, t);
  end loop;
end $$;

-- Tarifa em vigor numa data (a mais recente com valid_from <= data).
create or replace view public.current_supplier_rates
with (security_invoker = true) as
select distinct on (r.product_id, r.country_code, r.quantity)
  p.key as product_key, p.currency, r.*
from public.supplier_rates r
join public.cost_products p on p.id = r.product_id
where r.valid_from <= public.today_lisbon()
order by r.product_id, r.country_code, r.quantity, r.valid_from desc;

revoke all on public.current_supplier_rates from anon;
grant select on public.current_supplier_rates to authenticated, service_role;
