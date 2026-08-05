-- Aplicado direto via Supabase MCP em 05/08/2026 (projeto uinalmjnsdnjqzhraxtt)
-- Migration: copiar_funcao_ao_criar_membro
--
-- A função (funcao) já vinha no convite por e-mail e ficava salva em perfis.funcao,
-- mas o gatilho que cria o cadastro de membro automaticamente (sql/016) não estava
-- copiando esse campo. Corrigido, com backfill de quem já tinha ficado sem.

create or replace function public.trg_criar_membro_para_novo_perfil()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_membro_existente uuid;
begin
  select id into v_membro_existente
  from membros
  where igreja_id = NEW.igreja_id and perfil_id is null and lower(trim(nome)) = lower(trim(NEW.nome))
  limit 1;

  if v_membro_existente is not null then
    update membros set perfil_id = NEW.id, funcao = coalesce(funcao, NEW.funcao) where id = v_membro_existente;
  else
    insert into membros (igreja_id, perfil_id, nome, email, funcao, ativo)
    values (NEW.igreja_id, NEW.id, NEW.nome, NEW.email, NEW.funcao, true);
  end if;

  return NEW;
end;
$$;

update membros m set funcao = p.funcao
from perfis p
where m.perfil_id = p.id and m.funcao is null and p.funcao is not null;
