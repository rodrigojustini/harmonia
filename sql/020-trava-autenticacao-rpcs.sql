-- Aplicado direto via Supabase MCP em 06/08/2026 (projeto uinalmjnsdnjqzhraxtt)
-- Migration: trava_autenticacao_obrigatoria_rpcs
--
-- FALHA REAL E SÉRIA encontrada em auditoria: quando auth.uid() é null (chamada
-- anônima, sem login), comparações tipo "x <> auth.uid()" ou "x = get_my_role()"
-- viram NULL em vez de FALSE em PL/pgSQL — e um "if null then raise" NÃO dispara
-- a exceção (PL/pgSQL trata condição NULL como falsa num IF sem ELSE, ou seja,
-- simplesmente pula o bloco e segue em frente). Resultado: confirmar_presenca,
-- excluir_membro e promover_lider podiam ser chamadas por QUALQUER UM sem estar
-- logado, direto na API REST do Supabase (/rest/v1/rpc/...), e as checagens de
-- permissão internas eram silenciosamente puladas.
--
-- Confirmado por teste: promover_lider('qualquer-uuid') sem sessão autenticada
-- promovia a pessoa a líder antes desta correção.
--
-- Correção: adiciona "if auth.uid() is null then raise exception 'Não
-- autenticado'; end if;" como a PRIMEIRA linha de cada função, antes de qualquer
-- outra lógica. remover_lideranca já era segura por acidente (o if/else final
-- cai em ELSE quando a condição é NULL), mas ganhou a mesma trava por
-- consistência/defesa em profundidade.

create or replace function public.confirmar_presenca(p_celula_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_igreja uuid;
  v_membro_id uuid;
  v_dono_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  if p_status not in ('pendente','confirmado','recusado') then
    raise exception 'Status inválido';
  end if;

  select igreja_id, membro_id into v_igreja, v_membro_id from escala_celulas where id = p_celula_id;

  if v_igreja is null or v_igreja <> get_my_igreja_id() then
    raise exception 'Célula não encontrada nesta igreja';
  end if;

  select exists(
    select 1 from membros where id = v_membro_id and perfil_id = auth.uid()
  ) into v_dono_ok;

  if not (v_dono_ok or is_lideranca()) then
    raise exception 'Sem permissão pra confirmar essa escala';
  end if;

  update escala_celulas set status_confirmacao = p_status where id = p_celula_id;
end;
$$;

create or replace function public.excluir_membro(p_membro_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_igreja uuid;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  if not is_lideranca() then
    raise exception 'Somente líderes ou administradores podem excluir membros';
  end if;

  select igreja_id into v_igreja from membros where id = p_membro_id;
  if v_igreja is null or v_igreja <> get_my_igreja_id() then
    raise exception 'Membro não encontrado nesta igreja';
  end if;

  delete from membros where id = p_membro_id;
end;
$$;

create or replace function public.promover_lider(p_perfil_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_caller_igreja uuid;
  v_caller_role text;
  v_target_igreja uuid;
  v_target_role text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  v_caller_igreja := get_my_igreja_id();
  v_caller_role := get_my_role();

  if v_caller_role not in ('admin','lider') then
    raise exception 'Sem permissão para promover líder';
  end if;

  select igreja_id, role into v_target_igreja, v_target_role from perfis where id = p_perfil_id;

  if v_target_igreja is null or v_target_igreja <> v_caller_igreja then
    raise exception 'Perfil não encontrado nesta igreja';
  end if;

  if v_target_role = 'admin' then
    raise exception 'Não é possível alterar o papel de um administrador';
  end if;

  update perfis set role = 'lider' where id = p_perfil_id;
end;
$$;

create or replace function public.remover_lideranca(p_perfil_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_caller_igreja uuid;
  v_caller_role text;
  v_target_igreja uuid;
  v_target_role text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  v_caller_igreja := get_my_igreja_id();
  v_caller_role := get_my_role();

  select igreja_id, role into v_target_igreja, v_target_role from perfis where id = p_perfil_id;

  if v_target_igreja is null or v_target_igreja <> v_caller_igreja then
    raise exception 'Perfil não encontrado nesta igreja';
  end if;

  if v_target_role <> 'lider' then
    raise exception 'Este perfil não é líder';
  end if;

  if v_caller_role = 'admin' or (v_caller_role = 'lider' and p_perfil_id = auth.uid()) then
    update perfis set role = 'member' where id = p_perfil_id;
  else
    raise exception 'Sem permissão para remover esta liderança';
  end if;
end;
$$;
