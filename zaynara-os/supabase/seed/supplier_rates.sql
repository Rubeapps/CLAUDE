-- =============================================================================
-- Seed: tabela de custos do fornecedor (outubro 2026)
-- Executar no SQL Editor DEPOIS do primeiro login (precisa do teu user id).
-- Na tabela original, "PRECO" = produto + envio e "SHIP" = só envio, por isso:
--   produto principal = 4,45 € por unidade, em todos os países
--   meias             = 0,74 $ por unidade, em todos os países
-- Países Baixos: sem envio disponível (fica de fora).
-- =============================================================================
with me as (
  select id from auth.users order by created_at limit 1
),
products as (
  insert into public.cost_products (user_id, key, name, currency)
  select me.id, v.key, v.name, v.currency
  from me, (values ('principal', 'Produto principal', 'EUR'),
                   ('meias',     'Meias',             'USD')) as v(key, name, currency)
  on conflict (user_id, key) do update set name = excluded.name
  returning id, key, user_id
),
-- país, qtd, preço total (produto+envio), envio
principal(country, qty, total, ship) as (values
  ('BE',1,16.18,11.73),('BE',2,24.39,15.49),('BE',3,32.61,19.26),
  ('DK',1,17.04,12.59),('DK',2,25.54,16.64),('DK',3,34.04,20.69),
  ('ES',1,15.20,10.75),('ES',2,22.99,14.09),('ES',3,30.80,17.45),
  ('FI',1,18.43,13.98),('FI',2,27.93,19.03),('FI',3,37.44,24.09),
  ('FR',1,15.42,10.97),('FR',2,23.54,14.64),('FR',3,31.15,17.80),
  ('IE',1,17.48,13.03),('IE',2,26.61,17.71),('IE',3,35.74,22.39),
  ('IT',1,19.61,15.16),('IT',2,27.36,18.46),('IT',3,35.10,21.75),
  ('LU',1,18.41,13.96),('LU',2,27.90,19.00),('LU',3,37.38,24.03),
  ('PL',1,19.47,15.02),('PL',2,30.21,21.31),('PL',3,40.94,27.59),
  ('SE',1,14.88,10.43),('SE',2,23.72,14.82),('SE',3,31.59,18.24),
  ('AT',1,15.78,11.33),('AT',2,23.23,14.33),('AT',3,30.68,17.33)
),
meias(country, qty, total, ship, supplier) as (values
  ('BE',1,10.28, 9.54,'Yun'),('DK',1,10.57, 9.83,'Yun'),
  ('ES',1, 8.95, 8.21,'Yun'),('FI',1,10.93,10.19,'Yun'),
  ('FR',1, 9.28, 8.54,'Yun'),('IE',1,10.26, 9.52,'Yun'),
  ('IT',1,13.41,12.67,'Yun'),('LU',1,10.97,10.23,'EQ')
)
insert into public.supplier_rates
  (user_id, product_id, country_code, quantity, supplier, product_cost, shipping_cost, valid_from)
select p.user_id, p.id, x.country, x.qty, x.supplier, x.total - x.ship, x.ship, date '2026-10-01'
from products p
join (
  select 'principal' as key, country, qty, total, ship, 'Por definir' as supplier from principal
  union all
  select 'meias', country, qty, total, ship, supplier from meias
) x on x.key = p.key
on conflict (product_id, country_code, quantity, valid_from) do update
  set supplier = excluded.supplier,
      product_cost = excluded.product_cost,
      shipping_cost = excluded.shipping_cost;
