-- Migration: cultos_pessoais_autonomia_membro
-- Objetivo: qualquer membro pode criar seu próprio culto/mapa, independente da liderança.
-- Cultos oficiais (dono_id null) continuam só-liderança e visíveis pra toda a igreja, como já era.
-- Cultos pessoais (dono_id = quem criou) só o dono vê e edita — não aparecem pra mais ninguém.

-- 1) Nova coluna: null = culto oficial da igreja; preenchido = culto pessoal de um membro
alter table public.cultos
  add column if not exists dono_id uuid references public.perfis(id) on delete cascade;

create index if not exists idx_cultos_dono on public.cultos(dono_id);

-- 2) Reescreve as policies de cultos:
--    SELECT: vê cultos oficiais da igreja (dono_id is null) OU os próprios cultos pessoais.
--    INSERT/UPDATE/DELETE: liderança gerencia oficiais; qualquer membro gerencia só os seus.
drop policy if exists "ver cultos da igreja" on public.cultos;
drop policy if exists "lideranca gerencia cultos" on public.cultos;

create policy "ver cultos oficiais ou proprios" on public.cultos for select
  using (
    igreja_id = get_my_igreja_id()
    and (dono_id is null or dono_id = auth.uid())
  );

create policy "lideranca gerencia cultos oficiais" on public.cultos for all
  using (igreja_id = get_my_igreja_id() and dono_id is null and is_lideranca())
  with check (igreja_id = get_my_igreja_id() and dono_id is null and is_lideranca());

create policy "membro gerencia seus cultos pessoais" on public.cultos for all
  using (igreja_id = get_my_igreja_id() and dono_id = auth.uid())
  with check (igreja_id = get_my_igreja_id() and dono_id = auth.uid());

-- 3) Mesma lógica para culto_musicas (as músicas dentro de cada culto).
drop policy if exists "ver culto_musicas da igreja" on public.culto_musicas;
drop policy if exists "lideranca gerencia culto_musicas" on public.culto_musicas;

create policy "ver culto_musicas oficiais ou proprios" on public.culto_musicas for select
  using (
    igreja_id = get_my_igreja_id()
    and exists (
      select 1 from public.cultos c
      where c.id = culto_musicas.culto_id
        and (c.dono_id is null or c.dono_id = auth.uid())
    )
  );

create policy "lideranca gerencia culto_musicas oficiais" on public.culto_musicas for all
  using (
    igreja_id = get_my_igreja_id() and is_lideranca()
    and exists (select 1 from public.cultos c where c.id = culto_musicas.culto_id and c.dono_id is null)
  )
  with check (
    igreja_id = get_my_igreja_id() and is_lideranca()
    and exists (select 1 from public.cultos c where c.id = culto_musicas.culto_id and c.dono_id is null)
  );

create policy "membro gerencia culto_musicas dos seus cultos" on public.culto_musicas for all
  using (
    igreja_id = get_my_igreja_id()
    and exists (select 1 from public.cultos c where c.id = culto_musicas.culto_id and c.dono_id = auth.uid())
  )
  with check (
    igreja_id = get_my_igreja_id()
    and exists (select 1 from public.cultos c where c.id = culto_musicas.culto_id and c.dono_id = auth.uid())
  );
