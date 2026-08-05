-- Aplicado direto via Supabase MCP em 04/08/2026 (projeto uinalmjnsdnjqzhraxtt)
-- Migration: campos_busca_musicas
-- Parte das melhorias de usabilidade: pesquisa de músicas por autor/categoria/tags/vocalista.

alter table public.musicas
  add column if not exists autor text,
  add column if not exists categoria text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists vocalista_id uuid references public.perfis(id) on delete set null;

alter table public.repertorio_pessoal
  add column if not exists autor text,
  add column if not exists categoria text,
  add column if not exists tags text[] not null default '{}';

create index if not exists idx_musicas_vocalista on public.musicas(vocalista_id);
