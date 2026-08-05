-- Aplicado direto via Supabase MCP em 05/08/2026 (projeto uinalmjnsdnjqzhraxtt)
-- Migration: excluir_propria_conta_lgpd
--
-- Direito à exclusão (LGPD). Qualquer pessoa pode apagar a própria conta e dados
-- pessoais pelo app (Config → Excluir minha conta). Registros compartilhados da
-- igreja (escalas, cultos, histórico) são preservados, só perdem o vínculo com a
-- pessoa — apagar o registro inteiro quebraria o histórico de todo mundo.

create or replace function public.excluir_minha_conta()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_igreja uuid;
  v_role text;
  v_outros_admins int;
begin
  if v_uid is null then
    raise exception 'Não autenticado';
  end if;

  select igreja_id, role into v_igreja, v_role from perfis where id = v_uid;
  if v_igreja is null then
    raise exception 'Perfil não encontrado';
  end if;

  -- Trava de segurança: se for a única admin da igreja, não deixa apagar sem promover outra pessoa antes
  if v_role = 'admin' then
    select count(*) into v_outros_admins from perfis where igreja_id = v_igreja and role = 'admin' and id <> v_uid;
    if v_outros_admins = 0 then
      raise exception 'Você é a única administradora da igreja. Promova outra pessoa a admin antes de excluir sua conta, ou a igreja fica sem ninguém pra gerenciar.';
    end if;
  end if;

  update escala_celulas ec set membro_id = null, nome_livre = coalesce(ec.nome_livre, m.nome)
  from membros m where ec.membro_id = m.id and m.perfil_id = v_uid;

  update escalas set criado_por = null where criado_por = v_uid;
  update cultos set criado_por = null where criado_por = v_uid;
  update escala_musicas set adicionado_por = null where adicionado_por = v_uid;
  update escala_membros set user_id = null where user_id = v_uid;
  delete from trocas_escala where solicitante_id = v_uid or receptor_id = v_uid or aprovado_por = v_uid;
  update historico set user_id = null where user_id = v_uid;
  update musicas set vocalista_id = null where vocalista_id = v_uid;

  delete from repertorio_pessoal where perfil_id = v_uid;
  delete from mapas_individuais where perfil_id = v_uid;
  delete from membros where perfil_id = v_uid;
  delete from perfis where id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

grant execute on function public.excluir_minha_conta() to authenticated;
revoke execute on function public.excluir_minha_conta() from anon, public;
