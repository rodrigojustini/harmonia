-- Aplicado direto via Supabase MCP em 04/08/2026 (projeto uinalmjnsdnjqzhraxtt)
-- Migration: fase1_papeis_lider_perfil_completo
-- ====== FASE 1: papel Líder + perfil de membro completo (estilo rede social) ======

-- 1) Papéis: admin / lider / member
alter table public.perfis drop constraint if exists perfis_role_check;
alter table public.perfis add constraint perfis_role_check check (role in ('admin','lider','member'));

-- 2) Campos novos em membros (perfil social)
alter table public.membros
  add column if not exists foto_url text,
  add column if not exists whatsapp text,
  add column if not exists email text,
  add column if not exists bio text,
  add column if not exists data_entrada date,
  add column if not exists disponibilidade text,
  add column if not exists ativo boolean not null default true,
  add column if not exists instrumentos text[] not null default '{}';

-- 3) Helper: admin ou lider
create or replace function public.is_lideranca()
returns boolean
language sql stable security definer set search_path = public
as $$
  select get_my_role() in ('admin','lider')
$$;

-- 4) RPCs de gestão de liderança/exclusão (fazem a checagem de regra de negócio internamente)
create or replace function public.promover_lider(p_perfil_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_caller_igreja uuid := get_my_igreja_id();
  v_caller_role text := get_my_role();
  v_target_igreja uuid;
  v_target_role text;
begin
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
  v_caller_igreja uuid := get_my_igreja_id();
  v_caller_role text := get_my_role();
  v_target_igreja uuid;
  v_target_role text;
begin
  select igreja_id, role into v_target_igreja, v_target_role from perfis where id = p_perfil_id;

  if v_target_igreja is null or v_target_igreja <> v_caller_igreja then
    raise exception 'Perfil não encontrado nesta igreja';
  end if;

  if v_target_role <> 'lider' then
    raise exception 'Este perfil não é líder';
  end if;

  -- admin sempre pode; líder só pode remover a própria liderança
  if v_caller_role = 'admin' or (v_caller_role = 'lider' and p_perfil_id = auth.uid()) then
    update perfis set role = 'member' where id = p_perfil_id;
  else
    raise exception 'Sem permissão para remover esta liderança';
  end if;
end;
$$;

create or replace function public.excluir_membro(p_membro_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_igreja uuid;
begin
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

grant execute on function public.promover_lider(uuid) to authenticated;
grant execute on function public.remover_lideranca(uuid) to authenticated;
grant execute on function public.excluir_membro(uuid) to authenticated;

-- 5) Trava auto-promoção via update direto (impede que o próprio usuário mude seu role/igreja)
drop policy if exists "editar proprio perfil" on public.perfis;
create policy "editar proprio perfil" on public.perfis for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = get_my_role() and igreja_id = get_my_igreja_id());

-- Admin/lider podem editar perfis da igreja, mas nunca promover a admin nem alterar um admin (isso passa pelas RPCs acima)
drop policy if exists "admin edita perfis da igreja" on public.perfis;
create policy "lideranca edita perfis da igreja" on public.perfis for update
  using (igreja_id = get_my_igreja_id() and is_lideranca() and role <> 'admin')
  with check (igreja_id = get_my_igreja_id() and role <> 'admin');

-- 6) Membros: separar leitura (todos da igreja) de escrita (líder/admin, + autoedição do próprio cadastro)
drop policy if exists "isolamento igreja" on public.membros;

create policy "ver membros da igreja" on public.membros for select
  using (igreja_id = get_my_igreja_id());

create policy "lideranca gerencia membros" on public.membros for all
  using (igreja_id = get_my_igreja_id() and is_lideranca())
  with check (igreja_id = get_my_igreja_id() and is_lideranca());

create policy "membro edita proprio cadastro" on public.membros for update
  using (perfil_id = auth.uid())
  with check (perfil_id = auth.uid() and igreja_id = get_my_igreja_id());

-- 7) Escalas: leitura pra todos da igreja, escrita só líder/admin
drop policy if exists "isolamento igreja" on public.escalas;
create policy "ver escalas da igreja" on public.escalas for select using (igreja_id = get_my_igreja_id());
create policy "lideranca gerencia escalas" on public.escalas for all
  using (igreja_id = get_my_igreja_id() and is_lideranca())
  with check (igreja_id = get_my_igreja_id() and is_lideranca());

drop policy if exists "isolamento igreja" on public.escala_colunas;
create policy "ver colunas da igreja" on public.escala_colunas for select using (igreja_id = get_my_igreja_id());
create policy "lideranca gerencia colunas" on public.escala_colunas for all
  using (igreja_id = get_my_igreja_id() and is_lideranca())
  with check (igreja_id = get_my_igreja_id() and is_lideranca());

drop policy if exists "isolamento igreja" on public.escala_linhas;
create policy "ver linhas da igreja" on public.escala_linhas for select using (igreja_id = get_my_igreja_id());
create policy "lideranca gerencia linhas" on public.escala_linhas for all
  using (igreja_id = get_my_igreja_id() and is_lideranca())
  with check (igreja_id = get_my_igreja_id() and is_lideranca());

drop policy if exists "isolamento igreja" on public.escala_celulas;
create policy "ver celulas da igreja" on public.escala_celulas for select using (igreja_id = get_my_igreja_id());
create policy "lideranca gerencia celulas" on public.escala_celulas for all
  using (igreja_id = get_my_igreja_id() and is_lideranca())
  with check (igreja_id = get_my_igreja_id() and is_lideranca());
