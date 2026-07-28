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
