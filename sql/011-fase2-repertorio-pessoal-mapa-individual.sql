-- Aplicado direto via Supabase MCP em 04/08/2026 (projeto uinalmjnsdnjqzhraxtt)
-- Migration: fase2_repertorio_pessoal_e_mapa_individual
-- ====== FASE 2: Biblioteca particular do vocalista + Mapa musical individual ======

-- 1) Corrige a mesma falha de RLS que existia em membros/escalas: repertorio oficial e
--    cultos (mapa oficial) só podem ser escritos por lideranca; leitura continua aberta pra igreja.
drop policy if exists "isolamento igreja" on public.musicas;
create policy "ver musicas da igreja" on public.musicas for select using (igreja_id = get_my_igreja_id());
create policy "lideranca gerencia musicas" on public.musicas for all
  using (igreja_id = get_my_igreja_id() and is_lideranca())
  with check (igreja_id = get_my_igreja_id() and is_lideranca());

drop policy if exists "isolamento igreja" on public.cultos;
create policy "ver cultos da igreja" on public.cultos for select using (igreja_id = get_my_igreja_id());
create policy "lideranca gerencia cultos" on public.cultos for all
  using (igreja_id = get_my_igreja_id() and is_lideranca())
  with check (igreja_id = get_my_igreja_id() and is_lideranca());

drop policy if exists "isolamento igreja" on public.culto_musicas;
create policy "ver culto_musicas da igreja" on public.culto_musicas for select using (igreja_id = get_my_igreja_id());
create policy "lideranca gerencia culto_musicas" on public.culto_musicas for all
  using (igreja_id = get_my_igreja_id() and is_lideranca())
  with check (igreja_id = get_my_igreja_id() and is_lideranca());

-- 2) Meu Repertório: biblioteca particular, vinculada ao dono (qualquer pessoa logada, tipicamente
--    o vocalista). Só o dono vê/edita a própria biblioteca.
create table if not exists public.repertorio_pessoal (
  id uuid primary key default gen_random_uuid(),
  igreja_id uuid not null references public.igrejas(id) on delete cascade,
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  titulo text not null,
  tom_original text,
  link text,
  cifra text,
  observacoes text,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

alter table public.repertorio_pessoal enable row level security;

create policy "dono gerencia seu repertorio" on public.repertorio_pessoal for all
  using (perfil_id = auth.uid() and igreja_id = get_my_igreja_id())
  with check (perfil_id = auth.uid() and igreja_id = get_my_igreja_id());

create index if not exists idx_repertorio_pessoal_dono on public.repertorio_pessoal(perfil_id);

-- 3) Mapa individual por culto: cada músico anota sua própria versão do mapa oficial.
--    Nunca altera culto_musicas (mapa oficial) — só a própria linha aqui.
create table if not exists public.mapas_individuais (
  id uuid primary key default gen_random_uuid(),
  igreja_id uuid not null references public.igrejas(id) on delete cascade,
  culto_id uuid not null references public.cultos(id) on delete cascade,
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  instrumento text,
  conteudo text,
  atualizado_em timestamptz default now(),
  unique (culto_id, perfil_id)
);

alter table public.mapas_individuais enable row level security;

create policy "dono gerencia seu mapa individual" on public.mapas_individuais for all
  using (perfil_id = auth.uid() and igreja_id = get_my_igreja_id())
  with check (perfil_id = auth.uid() and igreja_id = get_my_igreja_id());

create index if not exists idx_mapas_individuais_culto on public.mapas_individuais(culto_id);
