-- Aplicado direto via Supabase MCP em 05/08/2026 (projeto uinalmjnsdnjqzhraxtt)
-- Migration: trava_registrar_historico_direto
--
-- Achado na auditoria geral: registrar_historico() podia ser chamada diretamente via
-- RPC por qualquer usuário autenticado, sem checar se o igreja_id informado era o dele
-- — permitia forjar entradas de histórico de qualquer igreja. Revoga o acesso externo;
-- as triggers continuam funcionando (chamada interna não passa por GRANT/RLS de role).

revoke execute on function public.registrar_historico(uuid, text, jsonb) from public, anon, authenticated;

-- Funções de trigger não fazem sentido chamadas via RPC direto (dependem de NEW/OLD,
-- que só existem dentro de um gatilho real) — revoga só por higiene.
revoke execute on function public.trg_criar_membro_para_novo_perfil() from public, anon, authenticated;
revoke execute on function public.trg_historico_musicas() from public, anon, authenticated;
revoke execute on function public.trg_historico_membros() from public, anon, authenticated;
revoke execute on function public.trg_historico_escalas() from public, anon, authenticated;
revoke execute on function public.trg_historico_escala_celulas() from public, anon, authenticated;
revoke execute on function public.trg_historico_cultos() from public, anon, authenticated;
revoke execute on function public.trg_historico_trocas() from public, anon, authenticated;
