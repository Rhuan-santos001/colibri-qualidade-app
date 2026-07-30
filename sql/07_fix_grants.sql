-- =====================================================================
-- CORREÇÃO: "permission denied for table inspecoes" / 401 Unauthorized
-- Rode este arquivo inteiro no SQL Editor do Supabase. Não apaga nem
-- duplica nada — só concede os privilégios que faltaram.
--
-- Causa: RLS (as "policies") controla QUAIS LINHAS um role pode ver/
-- alterar, mas o Postgres também exige a permissão básica na TABELA
-- (GRANT) antes mesmo de olhar a RLS. Como as tabelas foram criadas
-- direto no SQL Editor (dono = postgres), os roles anon/authenticated
-- usados pelo site não tinham GRANT SELECT/INSERT nelas.
-- =====================================================================

grant usage on schema public to anon, authenticated;

-- Cadastros de apoio: só leitura para o site
grant select on public.setores  to anon, authenticated;
grant select on public.recursos to anon, authenticated;
grant select on public.pecas    to anon, authenticated;
grant select on public.lotes    to anon, authenticated;
grant select on public.ordens   to anon, authenticated;

-- Movimento do app: leitura + gravação
grant select, insert           on public.inspecoes   to anon, authenticated;
grant select, insert, update   on public.fca          to anon, authenticated;
grant select, insert           on public.fca_retorno  to anon, authenticated;

-- public.usuarios propositalmente NÃO recebe grant nenhum aqui — ela só
-- pode ser acessada através das funções app_login/app_criar_usuario/etc,
-- que já têm GRANT EXECUTE próprio.
