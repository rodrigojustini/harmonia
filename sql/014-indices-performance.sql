-- Aplicado direto via Supabase MCP em 04/08/2026 (projeto uinalmjnsdnjqzhraxtt)
-- Migration: indices_performance_escala_cultos
-- Parte da auditoria geral de performance. Consultas que filtram por escala_id
-- (grade de escala, dashboard) e por data (lista/próximo culto) faziam sequential
-- scan. Volume ainda pequeno pra fazer diferença hoje, mas o índice já garante
-- que cresça sem degradar.

create index if not exists idx_escala_celulas_escala_id on public.escala_celulas(escala_id);
create index if not exists idx_cultos_data on public.cultos(data);
create index if not exists idx_cultos_igreja_data on public.cultos(igreja_id, data);
