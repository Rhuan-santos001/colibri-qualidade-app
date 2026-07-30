-- =====================================================================
-- GESTÃO DA QUALIDADE — SCHEMA SUPABASE
-- =====================================================================
-- Execute este arquivo inteiro no SQL Editor do Supabase (Project ->
-- SQL Editor -> New query -> cole tudo -> Run).
--
-- Depois execute, na ordem:
--   02_seed_setores_recursos.sql   (carrega Setores e Recursos da planilha)
--   03_funcoes_auth.sql            (login/senha próprio do sistema)
--   04_storage.sql                 (bucket de anexos)
--
-- O sistema NÃO usa Supabase Auth (e-mail/senha do Supabase). Foi criado
-- um esquema de login e senha próprio (tabela usuarios + funções RPC),
-- porque o app é 100% estático (HTML/JS hospedado no GitHub Pages) e
-- você pediu uma tela de Configurações dentro do próprio sistema para
-- cadastrar inspetores. Ver README.md para detalhes de segurança.
-- =====================================================================

create extension if not exists "pgcrypto" with schema extensions;

-- ---------------------------------------------------------------------
-- USUÁRIOS (login do sistema)
-- ---------------------------------------------------------------------
create table if not exists public.usuarios (
  id           uuid primary key default gen_random_uuid(),
  usuario      text not null unique,
  senha_hash   text not null,
  nome         text not null,
  perfil       text not null default 'inspetor' check (perfil in ('admin','inspetor')),
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- SETORES e RECURSOS (máquinas) — vindos da planilha SETORES_E_RECURSOS
-- ---------------------------------------------------------------------
create table if not exists public.setores (
  id    serial primary key,
  nome  text not null unique
);

create table if not exists public.recursos (
  id         serial primary key,
  setor_id   integer not null references public.setores(id) on delete cascade,
  codigo     text not null,
  nome       text not null,
  unique (setor_id, codigo, nome)
);

-- ---------------------------------------------------------------------
-- PEÇAS e LOTES — você vai preencher manualmente pelo Table Editor do
-- Supabase (ou importando um CSV). Ficam vazias aqui de propósito.
-- ---------------------------------------------------------------------
create table if not exists public.pecas (
  id            serial primary key,
  codigo_peca   text not null unique,
  descricao     text
);

create table if not exists public.lotes (
  id                 serial primary key,
  numero_lote        text not null,
  ordem_fabricacao   text,
  codigo_peca        text references public.pecas(codigo_peca),
  criado_em          timestamptz not null default now(),
  unique (numero_lote, ordem_fabricacao, codigo_peca)
);

-- ---------------------------------------------------------------------
-- INSPEÇÕES (Cadastro de Inspeção)
-- ---------------------------------------------------------------------
create table if not exists public.inspecoes (
  id                 uuid primary key default gen_random_uuid(),
  numero_lote        text not null,
  ordem_fabricacao   text not null,
  codigo_peca        text not null,
  tipo_processo      text not null check (tipo_processo in ('Maquina','Pulmao')),
  descricao          text,
  setor_id           integer references public.setores(id),
  recurso_id         integer references public.recursos(id),
  conforme           boolean not null default true,
  anexos             jsonb not null default '[]'::jsonb,
  inspetor_id        uuid references public.usuarios(id),
  inspetor_nome      text not null,
  criado_em          timestamptz not null default now()
);

create index if not exists idx_inspecoes_lote on public.inspecoes (numero_lote);
create index if not exists idx_inspecoes_setor on public.inspecoes (setor_id);
create index if not exists idx_inspecoes_criado_em on public.inspecoes (criado_em desc);

-- ---------------------------------------------------------------------
-- FCA (Ficha de Controle / Ação — Cadastro FCA)
-- ---------------------------------------------------------------------
create table if not exists public.fca (
  id                     uuid primary key default gen_random_uuid(),
  inspecao_id            uuid references public.inspecoes(id),
  abrir_fca              boolean not null default true,
  setor_encontrado_id    integer references public.setores(id),
  setor_origem_id        integer references public.setores(id),
  nome_operador          text,
  quantidade_pecas       integer,
  como_identificado      text,
  detalhes_problema      text,
  anexos                 jsonb not null default '[]'::jsonb,
  status                 text not null default 'Pendente' check (status in ('Pendente','Concluida')),
  inspetor_id            uuid references public.usuarios(id),
  inspetor_nome          text not null,
  criado_em              timestamptz not null default now()
);

create index if not exists idx_fca_status on public.fca (status);
create index if not exists idx_fca_criado_em on public.fca (criado_em desc);

-- ---------------------------------------------------------------------
-- RETORNO FCA (baixa/fechamento das FCAs pendentes)
-- ---------------------------------------------------------------------
create table if not exists public.fca_retorno (
  id                 uuid primary key default gen_random_uuid(),
  fca_id             uuid not null references public.fca(id) on delete cascade,
  causa_raiz         text not null,
  acao_corretiva     text not null,
  responsavel        text not null,
  anexos             jsonb not null default '[]'::jsonb,
  inspetor_id        uuid references public.usuarios(id),
  inspetor_nome      text not null,
  criado_em          timestamptz not null default now()
);

-- Ao inserir um retorno, marca a FCA como Concluída automaticamente
create or replace function public.trg_fca_retorno_conclui()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.fca set status = 'Concluida' where id = new.fca_id;
  return new;
end;
$$;

drop trigger if exists fca_retorno_conclui on public.fca_retorno;
create trigger fca_retorno_conclui
  after insert on public.fca_retorno
  for each row execute function public.trg_fca_retorno_conclui();
