-- =====================================================================
-- REGRA: por Recurso (máquina), uma Ordem só pode ser inspecionada 1 vez
-- =====================================================================
-- O app já bloqueia isso na tela (verifica antes de deixar continuar),
-- mas essa trava no banco garante a regra mesmo se dois inspetores
-- tentarem salvar a mesma ordem/recurso ao mesmo tempo. Não se aplica
-- a inspeções tipo "Pulmão" (recurso_id fica nulo nesse caso).

create unique index if not exists uniq_inspecao_recurso_ordem
  on public.inspecoes (recurso_id, ordem_fabricacao)
  where recurso_id is not null;
