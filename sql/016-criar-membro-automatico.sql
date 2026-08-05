-- Aplicado direto via Supabase MCP em 04/08/2026 (projeto uinalmjnsdnjqzhraxtt)
-- Migration: criar_membro_automatico_ao_registrar
--
-- Bug real: nenhum caminho de criação de conta (convite por e-mail, criar igreja,
-- entrar com código) criava o cadastro correspondente em `membros`. Resultado: a
-- tabela `membros` estava vazia mesmo com 5 contas reais já existindo, incluindo
-- a admin. Líder nunca via ninguém na aba Membros a menos que criasse manualmente
-- e vinculasse pelo dropdown "Conta de login".

create or replace function public.trg_criar_membro_para_novo_perfil()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_membro_existente uuid;
begin
  -- Se o líder já tinha criado manualmente um cadastro com esse nome (sem conta
  -- vinculada ainda), vincula em vez de duplicar.
  select id into v_membro_existente
  from membros
  where igreja_id = NEW.igreja_id and perfil_id is null and lower(trim(nome)) = lower(trim(NEW.nome))
  limit 1;

  if v_membro_existente is not null then
    update membros set perfil_id = NEW.id where id = v_membro_existente;
  else
    insert into membros (igreja_id, perfil_id, nome, email, ativo)
    values (NEW.igreja_id, NEW.id, NEW.nome, NEW.email, true);
  end if;

  return NEW;
end;
$$;

drop trigger if exists criar_membro_para_novo_perfil on public.perfis;
create trigger criar_membro_para_novo_perfil
  after insert on public.perfis
  for each row execute function trg_criar_membro_para_novo_perfil();

-- Backfill: cria o cadastro de membro pra quem já tinha conta mas nunca ganhou um
insert into membros (igreja_id, perfil_id, nome, email, ativo)
select p.igreja_id, p.id, p.nome, p.email, true
from perfis p
where not exists (select 1 from membros m where m.perfil_id = p.id);
