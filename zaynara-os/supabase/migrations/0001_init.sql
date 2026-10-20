-- =============================================================================
-- Zaynara OS — Esquema inicial (Fase 1)
-- Executar uma vez no Supabase SQL Editor (ou via `supabase db push`).
-- É idempotente nos pontos críticos (extensões, enums, bucket), mas foi
-- pensado para correr numa base de dados limpa.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Extensões
-- -----------------------------------------------------------------------------
create extension if not exists vector with schema extensions;   -- pgvector (RAG)
create extension if not exists moddatetime with schema extensions; -- updated_at

-- -----------------------------------------------------------------------------
-- 1. Tipos enumerados
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.expense_frequency as enum ('one_time', 'monthly', 'yearly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.expense_kind as enum ('fixed', 'variable');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_status as enum ('todo', 'in_progress', 'done');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.knowledge_category as enum
    ('fiscalidade', 'estrategia', 'marketing', 'operacoes', 'lideranca');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ingestion_status as enum ('pending', 'processing', 'ready', 'error');
exception when duplicate_object then null; end $$;

-- Data de "hoje" no fuso de Portugal (o Postgres do Supabase corre em UTC).
create or replace function public.today_lisbon()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Europe/Lisbon')::date $$;

-- =============================================================================
-- MÓDULO 4 — Despesas e Subscrições
-- =============================================================================
create table if not exists public.expenses (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid()
                         references auth.users (id) on delete cascade,
  name                 text not null check (char_length(name) between 1 and 120),
  vendor               text,                                  -- ex: Shopify, Hostinger
  category             text,                                  -- ex: Software, Domínios, Apps
  kind                 public.expense_kind not null default 'fixed',
  amount               numeric(12, 2) not null check (amount >= 0),
  currency             char(3) not null default 'EUR',
  frequency            public.expense_frequency not null,
  next_payment_date    date not null,
  is_active            boolean not null default true,
  -- Deduplicação do cron: guarda a data de pagamento para a qual já foi
  -- enviado alerta, para nunca mandar o mesmo email duas vezes.
  alert_sent_for_date  date,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists expenses_user_next_payment_idx
  on public.expenses (user_id, next_payment_date)
  where is_active;

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function extensions.moddatetime(updated_at);

-- Vista usada pela UI: calcula dias até ao pagamento e a flag do badge
-- vermelho (≤ 3 dias). security_invoker => respeita o RLS de `expenses`.
create or replace view public.expenses_with_status
with (security_invoker = true) as
select
  e.*,
  (e.next_payment_date - public.today_lisbon())           as days_until_due,
  (e.is_active
    and e.next_payment_date - public.today_lisbon() <= 3)  as is_due_soon,
  case e.frequency
    when 'monthly'  then e.amount
    when 'yearly'   then round(e.amount / 12, 2)
    else 0
  end                                                      as monthly_equivalent
from public.expenses e;

-- Avança a próxima data de pagamento das despesas recorrentes já vencidas
-- (chamada pelo cron diário). Despesas 'one_time' vencidas ficam inativas.
-- Salta diretamente N períodos para evitar drift acumulado de fim de mês.
create or replace function public.roll_forward_expenses()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today   date := public.today_lisbon();
  v_updated integer := 0;
  v_rows    integer;
begin
  -- k = menor múltiplo do período (1 ou 12 meses) tal que data + k >= hoje.
  with overdue as (
    select e.id,
           e.next_payment_date as d,
           case e.frequency when 'monthly' then 1 else 12 end as step,
           age(v_today, e.next_payment_date) as a
      from public.expenses e
     where e.is_active
       and e.frequency in ('monthly', 'yearly')
       and e.next_payment_date < v_today
  ),
  base as (
    select o.id, o.d, o.step,
           (((extract(year from o.a) * 12 + extract(month from o.a))::int / o.step) * o.step) as k0
      from overdue o
  )
  update public.expenses e
     set next_payment_date = (b.d + make_interval(months =>
           case when (b.d + make_interval(months => b.k0))::date >= v_today
                then b.k0 else b.k0 + b.step end))::date
    from base b
   where e.id = b.id;
  get diagnostics v_rows = row_count;
  v_updated := v_updated + v_rows;

  update public.expenses e
     set is_active = false
   where e.is_active
     and e.frequency = 'one_time'
     and e.next_payment_date < v_today;
  get diagnostics v_rows = row_count;
  v_updated := v_updated + v_rows;

  return v_updated;
end;
$$;

-- =============================================================================
-- MÓDULO 5 — Operações: SOPs + Kanban
-- =============================================================================
create table if not exists public.sops (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 160),
  url          text not null check (url ~* '^https?://'),
  description  text,
  category     text,                                   -- ex: Apoio ao Cliente
  tags         text[] not null default '{}',
  is_pinned    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists sops_user_idx on public.sops (user_id, is_pinned desc, title);

create trigger sops_set_updated_at
  before update on public.sops
  for each row execute function extensions.moddatetime(updated_at);

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 200),
  description   text,
  status        public.task_status not null default 'todo',
  priority      public.task_priority not null default 'medium',
  -- Ordenação dentro da coluna do Kanban (fractional indexing: ao largar um
  -- cartão entre A e B, position = (A.position + B.position) / 2 — 1 UPDATE só).
  position      double precision not null default extract(epoch from now()),
  due_date      date,
  sop_id        uuid references public.sops (id) on delete set null,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists tasks_board_idx on public.tasks (user_id, status, position);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function extensions.moddatetime(updated_at);

-- Mantém completed_at coerente com o status.
create or replace function public.tasks_sync_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_completed_at
  before insert or update of status on public.tasks
  for each row execute function public.tasks_sync_completed_at();

-- =============================================================================
-- MÓDULO 2 — O Cérebro (RAG)
-- =============================================================================
-- Um registo por PDF carregado (Storage). Controla o estado da indexação.
create table if not exists public.document_sources (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,
  title         text not null,
  category      public.knowledge_category not null,
  storage_path  text not null unique,                 -- "<user_id>/<uuid>.pdf"
  file_size     bigint,
  checksum      text,                                 -- sha256, evita duplicados
  -- Data de referência do conteúdo (ex: versão do CIVA). Crucial em fiscalidade
  -- para a IA avisar quando a fonte pode estar desatualizada.
  effective_date date,
  status        public.ingestion_status not null default 'pending',
  error         text,
  chunk_count   integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, checksum)
);

create index if not exists document_sources_user_idx
  on public.document_sources (user_id, category, status);

create trigger document_sources_set_updated_at
  before update on public.document_sources
  for each row execute function extensions.moddatetime(updated_at);

-- Chunks + embeddings. Colunas content/metadata/embedding compatíveis com o
-- SupabaseVectorStore do LangChain.js.
-- 768 dimensões: gemini-embedding-001 com outputDimensionality=768
-- (mantém o índice HNSW < 2000 dims e poupa espaço nos 500 MB do free tier).
create table if not exists public.documents (
  id           bigint primary key generated always as identity,
  user_id      uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  source_id    uuid not null references public.document_sources (id) on delete cascade,
  category     public.knowledge_category not null,
  chunk_index  integer not null,
  content      text not null,
  metadata     jsonb not null default '{}'::jsonb,   -- página, secção, artigo…
  embedding    extensions.vector(768) not null,
  -- Pesquisa lexical em português: apanha referências exatas que a pesquisa
  -- semântica falha (ex: "artigo 53.º do CIVA", "Modelo 22").
  fts          tsvector generated always as (to_tsvector('portuguese', content)) stored,
  created_at   timestamptz not null default now(),
  unique (source_id, chunk_index)
);

create index if not exists documents_embedding_hnsw_idx
  on public.documents using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists documents_fts_idx on public.documents using gin (fts);
create index if not exists documents_user_category_idx on public.documents (user_id, category);
create index if not exists documents_metadata_idx on public.documents using gin (metadata);

-- Pesquisa semântica (assinatura compatível com LangChain: query_embedding,
-- match_count, filter). `filter` aceita {"category": "fiscalidade"} e/ou
-- qualquer chave de metadata. SECURITY INVOKER => o RLS filtra por utilizador.
create or replace function public.match_documents(
  query_embedding extensions.vector(768),
  match_count     integer default 8,
  filter          jsonb   default '{}'::jsonb,
  match_threshold double precision default 0
)
returns table (
  id          bigint,
  source_id   uuid,
  category    public.knowledge_category,
  content     text,
  metadata    jsonb,
  similarity  double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    d.id,
    d.source_id,
    d.category,
    d.content,
    d.metadata || jsonb_build_object(
      'category', d.category,
      'source_title', s.title,
      'effective_date', s.effective_date
    ),
    1 - (d.embedding <=> query_embedding) as similarity
  from public.documents d
  join public.document_sources s on s.id = d.source_id
  where (d.metadata || jsonb_build_object('category', d.category)) @> filter
    and 1 - (d.embedding <=> query_embedding) >= match_threshold
  order by d.embedding <=> query_embedding
  limit least(match_count, 50);
$$;

-- Pesquisa híbrida (semântica + full-text PT) com Reciprocal Rank Fusion.
-- É esta que o Cérebro usa por defeito; devolve também a similaridade
-- semântica bruta para a regra "se não houver evidência → fallback web".
create or replace function public.hybrid_search_documents(
  query_text      text,
  query_embedding extensions.vector(768),
  match_count     integer default 8,
  filter          jsonb   default '{}'::jsonb,
  rrf_k           integer default 50
)
returns table (
  id          bigint,
  source_id   uuid,
  category    public.knowledge_category,
  content     text,
  metadata    jsonb,
  similarity  double precision,
  rrf_score   double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with candidates as (
    select d.*
    from public.documents d
    where (d.metadata || jsonb_build_object('category', d.category)) @> filter
  ),
  semantic as (
    select c.id,
           1 - (c.embedding <=> query_embedding) as similarity,
           row_number() over (order by c.embedding <=> query_embedding) as rank
    from candidates c
    order by c.embedding <=> query_embedding
    limit least(match_count, 50) * 2
  ),
  lexical as (
    select c.id,
           row_number() over (
             order by ts_rank_cd(c.fts, websearch_to_tsquery('portuguese', query_text)) desc
           ) as rank
    from candidates c
    where c.fts @@ websearch_to_tsquery('portuguese', query_text)
    order by ts_rank_cd(c.fts, websearch_to_tsquery('portuguese', query_text)) desc
    limit least(match_count, 50) * 2
  ),
  fused as (
    select coalesce(s.id, l.id) as id,
           s.similarity,
           coalesce(1.0 / (rrf_k + s.rank), 0)
         + coalesce(1.0 / (rrf_k + l.rank), 0) as rrf_score
    from semantic s
    full outer join lexical l on l.id = s.id
  )
  select
    d.id,
    d.source_id,
    d.category,
    d.content,
    d.metadata || jsonb_build_object(
      'category', d.category,
      'source_title', src.title,
      'effective_date', src.effective_date
    ),
    coalesce(f.similarity, 1 - (d.embedding <=> query_embedding)) as similarity,
    f.rrf_score
  from fused f
  join public.documents d          on d.id = f.id
  join public.document_sources src on src.id = d.source_id
  order by f.rrf_score desc
  limit least(match_count, 50);
$$;

-- =============================================================================
-- STORAGE — bucket privado para os PDFs do Cérebro
-- Caminho obrigatório: knowledge/<user_id>/<ficheiro>.pdf
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knowledge', 'knowledge', false, 52428800, array['application/pdf'])  -- 50 MB (limite free tier)
on conflict (id) do nothing;

-- =============================================================================
-- ROW LEVEL SECURITY
-- Regra única: cada linha pertence a auth.uid(). `(select auth.uid())` é
-- avaliado uma vez por query (recomendação de performance do Supabase).
-- O service role (cron, ingestão em background) ignora o RLS por design.
-- =============================================================================
alter table public.expenses         enable row level security;
alter table public.sops             enable row level security;
alter table public.tasks            enable row level security;
alter table public.document_sources enable row level security;
alter table public.documents        enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['expenses', 'sops', 'tasks', 'document_sources', 'documents']
  loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$I', t);

    execute format($p$
      create policy "%1$s_select_own" on public.%1$I
        for select to authenticated
        using ((select auth.uid()) = user_id)
    $p$, t);
    execute format($p$
      create policy "%1$s_insert_own" on public.%1$I
        for insert to authenticated
        with check ((select auth.uid()) = user_id)
    $p$, t);
    execute format($p$
      create policy "%1$s_update_own" on public.%1$I
        for update to authenticated
        using ((select auth.uid()) = user_id)
        with check ((select auth.uid()) = user_id)
    $p$, t);
    execute format($p$
      create policy "%1$s_delete_own" on public.%1$I
        for delete to authenticated
        using ((select auth.uid()) = user_id)
    $p$, t);
  end loop;
end $$;

-- Uma tarefa só pode apontar para um SOP do próprio utilizador.
create or replace function public.tasks_check_sop_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sop_id is not null and not exists (
    select 1 from public.sops s where s.id = new.sop_id and s.user_id = new.user_id
  ) then
    raise exception 'sop_id % não pertence a este utilizador', new.sop_id;
  end if;
  return new;
end;
$$;

create trigger tasks_sop_owner
  before insert or update of sop_id on public.tasks
  for each row execute function public.tasks_check_sop_owner();

-- Storage: cada utilizador só vê/escreve na sua pasta do bucket "knowledge".
drop policy if exists "knowledge_select_own" on storage.objects;
drop policy if exists "knowledge_insert_own" on storage.objects;
drop policy if exists "knowledge_update_own" on storage.objects;
drop policy if exists "knowledge_delete_own" on storage.objects;

create policy "knowledge_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'knowledge'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "knowledge_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'knowledge'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "knowledge_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'knowledge'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "knowledge_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'knowledge'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- =============================================================================
-- PERMISSÕES DE FUNÇÕES
-- Funções/vistas não devem ser chamáveis por visitantes anónimos.
-- =============================================================================
revoke all on function public.match_documents(extensions.vector, integer, jsonb, double precision) from public, anon;
revoke all on function public.hybrid_search_documents(text, extensions.vector, integer, jsonb, integer) from public, anon;
revoke all on function public.roll_forward_expenses() from public, anon, authenticated;
revoke all on public.expenses_with_status from anon;

grant execute on function public.match_documents(extensions.vector, integer, jsonb, double precision) to authenticated, service_role;
grant execute on function public.hybrid_search_documents(text, extensions.vector, integer, jsonb, integer) to authenticated, service_role;
grant execute on function public.roll_forward_expenses() to service_role;
grant select on public.expenses_with_status to authenticated, service_role;
