-- Aplicado direto via Supabase MCP em 04/08/2026 (projeto uinalmjnsdnjqzhraxtt)
-- Migration: historico_automatico_via_triggers
-- ====== Histórico automático via triggers (auditoria confiável) ======

-- Trava o histórico: só leitura pra igreja, escrita só pelas triggers (SECURITY DEFINER bypassa RLS)
drop policy if exists "isolamento igreja" on public.historico;
create policy "ver historico da igreja" on public.historico for select
  using (igreja_id = get_my_igreja_id());

-- Helper genérico usado por todas as triggers
create or replace function public.registrar_historico(p_igreja_id uuid, p_acao text, p_detalhes jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into historico (igreja_id, user_id, acao, detalhes, data)
  values (p_igreja_id, auth.uid(), p_acao, p_detalhes::text, now());
end;
$$;

-- ---- MÚSICAS ----
create or replace function public.trg_historico_musicas()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform registrar_historico(NEW.igreja_id, 'musica_adicionada', jsonb_build_object('titulo', NEW.titulo, 'tom', NEW.tom_original));
  elsif TG_OP = 'DELETE' then
    perform registrar_historico(OLD.igreja_id, 'musica_excluida', jsonb_build_object('titulo', OLD.titulo));
  end if;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists historico_musicas on public.musicas;
create trigger historico_musicas
  after insert or delete on public.musicas
  for each row execute function trg_historico_musicas();

-- ---- MEMBROS ----
create or replace function public.trg_historico_membros()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform registrar_historico(NEW.igreja_id, 'membro_criado', jsonb_build_object('nome', NEW.nome, 'funcao', NEW.funcao));
  elsif TG_OP = 'UPDATE' then
    perform registrar_historico(NEW.igreja_id, 'membro_editado', jsonb_build_object('nome', NEW.nome));
  elsif TG_OP = 'DELETE' then
    perform registrar_historico(OLD.igreja_id, 'membro_excluido', jsonb_build_object('nome', OLD.nome));
  end if;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists historico_membros on public.membros;
create trigger historico_membros
  after insert or update or delete on public.membros
  for each row execute function trg_historico_membros();

-- ---- ESCALAS (criação e aprovação) ----
create or replace function public.trg_historico_escalas()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform registrar_historico(NEW.igreja_id, 'escala_criada', jsonb_build_object('mes', NEW.mes, 'ano', NEW.ano));
  elsif TG_OP = 'UPDATE' and NEW.aprovada = true and coalesce(OLD.aprovada, false) = false then
    perform registrar_historico(NEW.igreja_id, 'escala_aprovada', jsonb_build_object('mes', NEW.mes, 'ano', NEW.ano));
  end if;
  return NEW;
end;
$$;

drop trigger if exists historico_escalas on public.escalas;
create trigger historico_escalas
  after insert or update on public.escalas
  for each row execute function trg_historico_escalas();

-- ---- ESCALA_CELULAS (quem foi escalado/removido de qual função/dia) ----
create or replace function public.trg_historico_escala_celulas()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_nome text;
  v_coluna text;
  v_dias text;
begin
  if TG_OP = 'DELETE' then
    select nome into v_coluna from escala_colunas where id = OLD.coluna_id;
    select dias into v_dias from escala_linhas where id = OLD.linha_id;
    perform registrar_historico(OLD.igreja_id, 'escala_celula_removida',
      jsonb_build_object('funcao', v_coluna, 'dia', v_dias));
    return OLD;
  end if;

  if TG_OP = 'UPDATE' and NEW.membro_id is not distinct from OLD.membro_id
     and NEW.nome_livre is not distinct from OLD.nome_livre then
    return NEW;
  end if;

  select nome into v_coluna from escala_colunas where id = NEW.coluna_id;
  select dias into v_dias from escala_linhas where id = NEW.linha_id;

  if NEW.membro_id is not null then
    select nome into v_nome from membros where id = NEW.membro_id;
  else
    v_nome := NEW.nome_livre;
  end if;

  if v_nome is not null and trim(v_nome) <> '' then
    perform registrar_historico(NEW.igreja_id, 'escala_celula_definida',
      jsonb_build_object('quem', v_nome, 'funcao', v_coluna, 'dia', v_dias));
  end if;
  return NEW;
end;
$$;

drop trigger if exists historico_escala_celulas on public.escala_celulas;
create trigger historico_escala_celulas
  after insert or update or delete on public.escala_celulas
  for each row execute function trg_historico_escala_celulas();

-- ---- CULTOS ----
create or replace function public.trg_historico_cultos()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform registrar_historico(NEW.igreja_id, 'culto_criado', jsonb_build_object('nome', NEW.nome, 'data', NEW.data));
  end if;
  return NEW;
end;
$$;

drop trigger if exists historico_cultos on public.cultos;
create trigger historico_cultos
  after insert on public.cultos
  for each row execute function trg_historico_cultos();

-- ---- TROCAS DE ESCALA ----
create or replace function public.trg_historico_trocas()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_solicitante text;
begin
  if TG_OP = 'INSERT' then
    select nome into v_solicitante from perfis where id = NEW.solicitante_id;
    perform registrar_historico(NEW.igreja_id, 'troca_solicitada',
      jsonb_build_object('por', v_solicitante, 'data', NEW.data));
  elsif TG_OP = 'UPDATE' and NEW.status is distinct from OLD.status then
    perform registrar_historico(NEW.igreja_id, 'troca_' || NEW.status, jsonb_build_object('data', NEW.data));
  end if;
  return NEW;
end;
$$;

drop trigger if exists historico_trocas on public.trocas_escala;
create trigger historico_trocas
  after insert or update on public.trocas_escala
  for each row execute function trg_historico_trocas();
