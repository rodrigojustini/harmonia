-- Aplicado direto via Supabase MCP em 04/08/2026 (projeto uinalmjnsdnjqzhraxtt)
-- Migration: fase3_confirmacao_presenca_e_bpm

-- Status de confirmação de presença por célula da escala (pendente/confirmado/recusado)
alter table public.escala_celulas
  add column if not exists status_confirmacao text not null default 'pendente';

alter table public.escala_celulas drop constraint if exists escala_celulas_status_check;
alter table public.escala_celulas add constraint escala_celulas_status_check
  check (status_confirmacao in ('pendente','confirmado','recusado'));

-- BPM opcional pra música (usado no Modo Palco)
alter table public.musicas add column if not exists bpm integer;

-- RPC: o próprio músico confirma/recusa a própria célula (sem abrir UPDATE geral em escala_celulas)
create or replace function public.confirmar_presenca(p_celula_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_igreja uuid;
  v_membro_id uuid;
  v_dono_ok boolean;
begin
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

grant execute on function public.confirmar_presenca(uuid, text) to authenticated;
