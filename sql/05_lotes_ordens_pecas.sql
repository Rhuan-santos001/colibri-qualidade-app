-- =====================================================================
-- LOTE -> ORDEM -> PEÇA (substitui as tabelas `lotes`/`pecas` vazias
-- criadas em 01_schema.sql por uma estrutura normalizada, para bater
-- com o script de importação diária `scripts/atualizar_lotes_ordens_pecas.py`)
-- Execute depois de 01/02/03/04. Seguro rodar mesmo que 01_schema.sql
-- já tenha criado `lotes` e `pecas` vazias — este script recria as
-- duas do zero (elas ainda não tinham dado nenhum importado).
-- =====================================================================

drop table if exists public.lotes cascade;
drop table if exists public.pecas cascade;

create table public.lotes (
  id          serial primary key,
  numero      text not null unique,
  criado_em   timestamptz not null default now()
);

create table public.pecas (
  id          serial primary key,
  codigo      text not null unique,
  descricao   text,
  criado_em   timestamptz not null default now()
);

-- Cada ORDEM DE FABRICAÇÃO pertence a um único Lote e a uma única Peça
-- (é assim que o relatório do ERP relaciona os três). É essa tabela que
-- permite, no app, selecionar o Lote, listar as Ordens daquele Lote e,
-- ao escolher a Ordem, preencher a Peça automaticamente.
create table public.ordens (
  id             serial primary key,
  numero         text not null unique,
  lote_id        integer not null references public.lotes(id) on delete cascade,
  peca_id        integer not null references public.pecas(id) on delete cascade,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index if not exists idx_ordens_lote on public.ordens (lote_id);
create index if not exists idx_ordens_peca on public.ordens (peca_id);

create or replace function public.trg_ordens_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists ordens_atualizado_em on public.ordens;
create trigger ordens_atualizado_em
  before update on public.ordens
  for each row execute function public.trg_ordens_atualizado_em();

-- ---------------------------------------------------------------------
-- RLS: leitura pública (o app usa a chave anon para os dropdowns);
-- a escrita é feita só pelo script de importação, com a chave
-- service_role, que ignora RLS — por isso não existe policy de insert
-- aqui.
-- ---------------------------------------------------------------------
alter table public.lotes  enable row level security;
alter table public.pecas  enable row level security;
alter table public.ordens enable row level security;

create policy "leitura publica lotes"  on public.lotes  for select using (true);
create policy "leitura publica pecas"  on public.pecas  for select using (true);
create policy "leitura publica ordens" on public.ordens for select using (true);
