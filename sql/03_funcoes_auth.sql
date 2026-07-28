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
