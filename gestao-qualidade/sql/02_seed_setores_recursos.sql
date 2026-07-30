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
