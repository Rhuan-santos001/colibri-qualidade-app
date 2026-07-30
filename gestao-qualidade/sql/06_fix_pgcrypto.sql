-- =====================================================================
-- CORREÇÃO: "function crypt(text, text) does not exist"
-- Rode este arquivo inteiro no SQL Editor do Supabase. Ele conserta o
-- ambiente que você já tem (não apaga nem duplica nada) — não precisa
-- refazer o restante do setup.
--
-- Causa: no Supabase, a extensão pgcrypto normalmente fica instalada
-- no schema `extensions`, não em `public`. As funções de login foram
-- criadas com "search_path = public", então não enxergavam crypt()/
-- gen_salt(). Este patch garante a extensão instalada e ajusta o
-- search_path das funções para incluir os dois schemas.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
-- Se a linha acima der erro "already exists in schema public", ignore
-- e siga em frente — só significa que já está instalada em outro lugar,
-- o que também é coberto pelo search_path abaixo.

create or replace function public.app_login(p_usuario text, p_senha text)
returns table (id uuid, usuario text, nome text, perfil text)
language plpgsql
security definer
set search_path = public, extensions
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
set search_path = public, extensions
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

create or replace function public.app_listar_usuarios(p_admin_usuario text, p_admin_senha text)
returns table (id uuid, usuario text, nome text, perfil text, ativo boolean, criado_em timestamptz)
language plpgsql
security definer
set search_path = public, extensions
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
set search_path = public, extensions
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

-- Garante que o usuário admin inicial existe (não sobrescreve se já
-- existir, então é seguro rodar de novo).
insert into public.usuarios (usuario, senha_hash, nome, perfil)
select 'admin', crypt('admin123', gen_salt('bf')), 'Administrador', 'admin'
where not exists (select 1 from public.usuarios where usuario = 'admin');

-- Teste rápido: deve devolver 1 linha com o usuário admin.
select * from public.app_login('admin', 'admin123');
