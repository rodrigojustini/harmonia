-- Aplicado direto via Supabase MCP em 04/08/2026 (projeto uinalmjnsdnjqzhraxtt)
-- Migration: bucket_avatars_membros
-- Bucket público de fotos de perfil dos membros. Caminho do arquivo sempre no
-- formato {igreja_id}/{membro_id}.ext — é isso que a policy usa pra restringir
-- upload/edição só a quem é da própria igreja.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "avatars leitura publica" on storage.objects;
create policy "avatars leitura publica" on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars upload lideranca ou proprio" on storage.objects;
create policy "avatars upload lideranca ou proprio" on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = get_my_igreja_id()::text
    and (
      is_lideranca()
      or exists (
        select 1 from membros m
        where m.id::text = regexp_replace(name, '^[^/]+/([^.]+).*$', '\1')
        and m.perfil_id = auth.uid()
      )
    )
  );

drop policy if exists "avatars update lideranca ou proprio" on storage.objects;
create policy "avatars update lideranca ou proprio" on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = get_my_igreja_id()::text
    and (
      is_lideranca()
      or exists (
        select 1 from membros m
        where m.id::text = regexp_replace(name, '^[^/]+/([^.]+).*$', '\1')
        and m.perfil_id = auth.uid()
      )
    )
  );

drop policy if exists "avatars delete lideranca" on storage.objects;
create policy "avatars delete lideranca" on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = get_my_igreja_id()::text
    and is_lideranca()
  );
