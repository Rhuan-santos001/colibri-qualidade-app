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

create extension if not exists "pgcrypto";

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
-- =====================================================================
-- SEED: SETORES E RECURSOS (dados extraídos de SETORES_E_RECURSOS.xlsx)
-- Execute depois de 01_schema.sql
-- =====================================================================

-- SETORES
insert into public.setores (nome) values
  ('USINAGEM'),
  ('CORTE'),
  ('COLADEIRA'),
  ('EMBALAGEM'),
  ('FURADEIRA'),
  ('LINHA DE PINTURA')
on conflict (nome) do nothing;

-- RECURSOS (maquinas)
insert into public.recursos (setor_id, codigo, nome) values
  ((select id from public.setores where nome='USINAGEM'), '1101', 'ESQUAD'),
  ((select id from public.setores where nome='USINAGEM'), '1115', 'ESQUAD'),
  ((select id from public.setores where nome='USINAGEM'), '1201', 'FRESA FC160E'),
  ((select id from public.setores where nome='USINAGEM'), '1202', 'FRESA DALMAQ'),
  ((select id from public.setores where nome='USINAGEM'), '1203', 'FRESA DALMAQ'),
  ((select id from public.setores where nome='USINAGEM'), '1204', 'TUPIA FRESA'),
  ((select id from public.setores where nome='USINAGEM'), '1205', 'TRABALHO MAN'),
  ((select id from public.setores where nome='USINAGEM'), '1304', 'CB. MANUAL'),
  ((select id from public.setores where nome='USINAGEM'), '1305', 'COL MAC SINGL'),
  ((select id from public.setores where nome='USINAGEM'), '1308', 'REFIL. MANUAL'),
  ((select id from public.setores where nome='USINAGEM'), '1311', 'CB CURVA'),
  ((select id from public.setores where nome='USINAGEM'), '1312', 'DESTOPAR MANU'),
  ((select id from public.setores where nome='USINAGEM'), '1102', 'ESQUAD'),
  ((select id from public.setores where nome='USINAGEM'), '1105', 'TUPIA'),
  ((select id from public.setores where nome='USINAGEM'), '1106', 'SERRA FITA'),
  ((select id from public.setores where nome='USINAGEM'), '1107', 'MULTI-SERRA'),
  ((select id from public.setores where nome='USINAGEM'), '1108', 'TUPIA SUP'),
  ((select id from public.setores where nome='USINAGEM'), '1109', 'MAQ GRAMPO'),
  ((select id from public.setores where nome='USINAGEM'), '1111', 'GRAMPO PORTA'),
  ((select id from public.setores where nome='USINAGEM'), '1112', 'GRAMPO PORTA'),
  ((select id from public.setores where nome='USINAGEM'), '1113', 'GRAMPO TAMPO'),
  ((select id from public.setores where nome='CORTE'), '1110', 'SEC.GIBEN'),
  ((select id from public.setores where nome='CORTE'), '1103', 'SEC. GIBEN'),
  ((select id from public.setores where nome='CORTE'), '1104', 'ESQUAD'),
  ((select id from public.setores where nome='CORTE'), '1114', 'SEC .HOMAG'),
  ((select id from public.setores where nome='COLADEIRA'), '1309', 'COL HOMAG'),
  ((select id from public.setores where nome='COLADEIRA'), '1310', 'COL ESQUAD'),
  ((select id from public.setores where nome='COLADEIRA'), '1306', 'COL MAC'),
  ((select id from public.setores where nome='COLADEIRA'), '1307', 'COL NAN AUT'),
  ((select id from public.setores where nome='COLADEIRA'), '1301', 'COL NAN AUT'),
  ((select id from public.setores where nome='COLADEIRA'), '1302', 'COL MAC CBN'),
  ((select id from public.setores where nome='COLADEIRA'), '1303', 'COL MAC CBN'),
  ((select id from public.setores where nome='COLADEIRA'), '1313', 'COL NAN 45'''),
  ((select id from public.setores where nome='COLADEIRA'), '1314', 'COL NAN 45'''),
  ((select id from public.setores where nome='EMBALAGEM'), '4101', 'LINHA EMB 01'),
  ((select id from public.setores where nome='EMBALAGEM'), '4102', 'LINHA EMB 02'),
  ((select id from public.setores where nome='FURADEIRA'), '1401', 'FUR BANC'),
  ((select id from public.setores where nome='FURADEIRA'), '1402', 'FUR LIDEAR'),
  ((select id from public.setores where nome='FURADEIRA'), '1404', 'FUR INVICTA'),
  ((select id from public.setores where nome='FURADEIRA'), '1407', 'FUR DRILL'),
  ((select id from public.setores where nome='FURADEIRA'), '1408', 'FUR MAC RAPID'),
  ((select id from public.setores where nome='FURADEIRA'), '1409', 'FUR BIESSE'),
  ((select id from public.setores where nome='FURADEIRA'), '1411', 'FUR BIESSE'),
  ((select id from public.setores where nome='FURADEIRA'), '1415', 'FUR LIDEAR'),
  ((select id from public.setores where nome='FURADEIRA'), '1416', 'FUR BHX'),
  ((select id from public.setores where nome='FURADEIRA'), '1417', 'CENTRO FUR'),
  ((select id from public.setores where nome='LINHA DE PINTURA'), '3101', 'LINHA PINT 01'),
  ((select id from public.setores where nome='LINHA DE PINTURA'), '3102', 'LINHA PINT 02')
on conflict do nothing;
-- =====================================================================
-- FUNÇÕES DE AUTENTICAÇÃO PRÓPRIA (login e senha do app)
-- Execute depois de 01_schema.sql e 02_seed_setores_recursos.sql
-- =====================================================================
-- Por que não usamos o Supabase Auth: o app é um site estático (GitHub
-- Pages) que fala com o Supabase usando a chave "anon". Não existe um
-- back-end próprio. Para permitir uma tela de "Configurações -> Criar
-- usuário" dentro do próprio app, a lógica de conferência de senha e
-- de criação de usuário roda dentro do banco, em funções SECURITY
-- DEFINER. A tabela public.usuarios fica com RLS ligada e SEM policy
-- nenhuma para o público — ou seja, só é acessível através destas
-- funções, nunca diretamente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- LOGIN: confere usuário/senha e devolve os dados (sem o hash)
-- ---------------------------------------------------------------------
create or replace function public.app_login(p_usuario text, p_senha text)
returns table (id uuid, usuario text, nome text, perfil text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select u.id, u.usuario, u.nome, u.perfil
    from public.usuarios u
    where u.usuario = lower(trim(p_usuario))
      and u.ativo = true
      and u.senha_hash = crypt(p_senha, u.senha_hash);
end;
$$;

revoke all on function public.app_login(text, text) from public;
grant execute on function public.app_login(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- CRIAR USUÁRIO: só funciona se usuario/senha de um ADMIN forem
-- informados e válidos. Usado pela tela Configurações.
-- ---------------------------------------------------------------------
create or replace function public.app_criar_usuario(
  p_admin_usuario   text,
  p_admin_senha     text,
  p_novo_usuario    text,
  p_novo_senha      text,
  p_novo_nome       text,
  p_novo_perfil     text default 'inspetor'
)
returns table (ok boolean, mensagem text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_ok boolean;
begin
  select exists (
    select 1 from public.usuarios u
    where u.usuario = lower(trim(p_admin_usuario))
      and u.ativo = true
      and u.perfil = 'admin'
      and u.senha_hash = crypt(p_admin_senha, u.senha_hash)
  ) into v_admin_ok;

  if not v_admin_ok then
    return query select false, 'Usuário/senha de administrador inválidos.';
    return;
  end if;

  if p_novo_usuario is null or length(trim(p_novo_usuario)) < 3 then
    return query select false, 'Informe um usuário com pelo menos 3 caracteres.';
    return;
  end if;

  if p_novo_senha is null or length(p_novo_senha) < 4 then
    return query select false, 'A senha deve ter pelo menos 4 caracteres.';
    return;
  end if;

  if exists (select 1 from public.usuarios where usuario = lower(trim(p_novo_usuario))) then
    return query select false, 'Já existe um usuário com esse nome de login.';
    return;
  end if;

  insert into public.usuarios (usuario, senha_hash, nome, perfil)
  values (
    lower(trim(p_novo_usuario)),
    crypt(p_novo_senha, gen_salt('bf')),
    trim(p_novo_nome),
    case when p_novo_perfil = 'admin' then 'admin' else 'inspetor' end
  );

  return query select true, 'Usuário criado com sucesso.';
end;
$$;

revoke all on function public.app_criar_usuario(text, text, text, text, text, text) from public;
grant execute on function public.app_criar_usuario(text, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- LISTAR USUÁRIOS: exige credenciais de admin, nunca devolve o hash
-- ---------------------------------------------------------------------
create or replace function public.app_listar_usuarios(p_admin_usuario text, p_admin_senha text)
returns table (id uuid, usuario text, nome text, perfil text, ativo boolean, criado_em timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_ok boolean;
begin
  select exists (
    select 1 from public.usuarios u
    where u.usuario = lower(trim(p_admin_usuario))
      and u.ativo = true
      and u.perfil = 'admin'
      and u.senha_hash = crypt(p_admin_senha, u.senha_hash)
  ) into v_admin_ok;

  if not v_admin_ok then
    return;
  end if;

  return query
    select u.id, u.usuario, u.nome, u.perfil, u.ativo, u.criado_em
    from public.usuarios u
    order by u.criado_em asc;
end;
$$;

revoke all on function public.app_listar_usuarios(text, text) from public;
grant execute on function public.app_listar_usuarios(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- ATIVAR / DESATIVAR / RESETAR SENHA de um usuário (só admin)
-- ---------------------------------------------------------------------
create or replace function public.app_atualizar_usuario(
  p_admin_usuario   text,
  p_admin_senha     text,
  p_usuario_id      uuid,
  p_ativo           boolean default null,
  p_nova_senha      text default null
)
returns table (ok boolean, mensagem text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_ok boolean;
begin
  select exists (
    select 1 from public.usuarios u
    where u.usuario = lower(trim(p_admin_usuario))
      and u.ativo = true
      and u.perfil = 'admin'
      and u.senha_hash = crypt(p_admin_senha, u.senha_hash)
  ) into v_admin_ok;

  if not v_admin_ok then
    return query select false, 'Usuário/senha de administrador inválidos.';
    return;
  end if;

  if p_ativo is not null then
    update public.usuarios set ativo = p_ativo where id = p_usuario_id;
  end if;

  if p_nova_senha is not null and length(p_nova_senha) >= 4 then
    update public.usuarios set senha_hash = crypt(p_nova_senha, gen_salt('bf')) where id = p_usuario_id;
  end if;

  return query select true, 'Usuário atualizado.';
end;
$$;

revoke all on function public.app_atualizar_usuario(text, text, uuid, boolean, text) from public;
grant execute on function public.app_atualizar_usuario(text, text, uuid, boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- USUÁRIO ADMIN INICIAL — troque a senha assim que entrar!
-- login: admin   |   senha: admin123
-- ---------------------------------------------------------------------
insert into public.usuarios (usuario, senha_hash, nome, perfil)
values ('admin', crypt('admin123', gen_salt('bf')), 'Administrador', 'admin')
on conflict (usuario) do nothing;

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.usuarios      enable row level security;
alter table public.setores       enable row level security;
alter table public.recursos      enable row level security;
alter table public.pecas         enable row level security;
alter table public.lotes         enable row level security;
alter table public.inspecoes     enable row level security;
alter table public.fca           enable row level security;
alter table public.fca_retorno   enable row level security;

-- usuarios: nenhuma policy pública -> só acessível via funções acima.

-- Leitura pública dos cadastros de apoio (setores/recursos/pecas/lotes).
-- Importante: como o app não usa Supabase Auth, não dá para restringir
-- por "usuário logado" no banco — a proteção de tela fica no app (você
-- só vê as telas depois do login). Veja o README para evoluir isso com
-- Supabase Auth caso deseje reforçar a segurança no futuro.
create policy "leitura publica setores" on public.setores for select using (true);
create policy "leitura publica recursos" on public.recursos for select using (true);
create policy "leitura publica pecas" on public.pecas for select using (true);
create policy "leitura publica lotes" on public.lotes for select using (true);

-- Inspeções / FCA / Retorno: leitura e inserção liberadas para o app;
-- edição só de FCA (para trocar status) e do retorno.
create policy "leitura inspecoes" on public.inspecoes for select using (true);
create policy "insercao inspecoes" on public.inspecoes for insert with check (true);

create policy "leitura fca" on public.fca for select using (true);
create policy "insercao fca" on public.fca for insert with check (true);
create policy "atualizacao fca" on public.fca for update using (true);

create policy "leitura fca_retorno" on public.fca_retorno for select using (true);
create policy "insercao fca_retorno" on public.fca_retorno for insert with check (true);
-- =====================================================================
-- STORAGE: bucket para os anexos (fotos/arquivos das inspeções e FCAs)
-- Execute por último.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('anexos', 'anexos', true)
on conflict (id) do nothing;

-- Leitura pública (necessária para exibir/baixar o anexo depois)
create policy "leitura publica anexos"
on storage.objects for select
using (bucket_id = 'anexos');

-- Qualquer cliente com a chave anon pode enviar arquivo para este bucket
create policy "upload anexos"
on storage.objects for insert
with check (bucket_id = 'anexos');
