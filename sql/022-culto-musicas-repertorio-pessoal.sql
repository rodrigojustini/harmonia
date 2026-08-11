-- Migration: culto_musicas_aceita_repertorio_pessoal
-- Objetivo: cultos pessoais (autonomia do membro) precisam poder usar músicas do
-- "Meu Repertório" pessoal, não só do catálogo compartilhado da igreja (que só
-- liderança cadastra). Sem isso, membro cria culto pessoal mas fica sem música pra
-- colocar nele caso o catálogo oficial esteja vazio ou não tenha a música que ele quer.

alter table public.culto_musicas
  alter column musica_id drop not null,
  add column if not exists repertorio_pessoal_id uuid references public.repertorio_pessoal(id) on delete cascade;

alter table public.culto_musicas
  drop constraint if exists culto_musicas_uma_origem_apenas;

alter table public.culto_musicas
  add constraint culto_musicas_uma_origem_apenas
  check (
    (musica_id is not null and repertorio_pessoal_id is null)
    or (musica_id is null and repertorio_pessoal_id is not null)
  );

create index if not exists idx_culto_musicas_repertorio_pessoal on public.culto_musicas(repertorio_pessoal_id);
