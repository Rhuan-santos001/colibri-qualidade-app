-- =====================================================================
-- FCA vinculada à peça/lote/ordem da inspeção que a originou
-- =====================================================================
-- Antes, a FCA só guardava inspecao_id (uuid). Agora também guarda o
-- lote/ordem/peça em texto direto na FCA — assim ela some sozinha na
-- tela mesmo se um dia a inspeção for apagada, e fica fácil de
-- filtrar/consultar sem precisar de join.

alter table public.fca
  add column if not exists numero_lote      text,
  add column if not exists ordem_fabricacao text,
  add column if not exists codigo_peca      text;

create index if not exists idx_fca_ordem on public.fca (ordem_fabricacao);
