begin;

-- Postgres Changes no comprueba RLS de la fila al publicar DELETE.
-- No cambiar la configuración de otras tablas si la publicación se comparte.
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime' and (puballtables or pubdelete or pubtruncate))
    and exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and (schemaname, tablename) <> ('public', 'song_requests')
    ) then
    raise exception 'La publicación supabase_realtime incluye otras tablas. Revisa sus operaciones antes de habilitar el borrado de eventos.';
  end if;
end $$;

alter publication supabase_realtime set (publish = 'insert, update');

create or replace function public.rename_event(p_event_id uuid, p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_name text := private.clean_text(p_name);
begin
  if v_user is null then raise insufficient_privilege using message = 'Autenticacion requerida'; end if;
  if v_name is null or char_length(v_name) not between 1 and 120 or v_name ~ '[[:cntrl:]]' then
    raise sqlstate 'PT400' using message = 'INVALID_INPUT';
  end if;

  update public.events e set name = v_name
  where e.id = p_event_id and exists (
    select 1 from public.workspace_members m
    where m.workspace_id = e.workspace_id and m.user_id = v_user and m.role = 'owner'
  );
  if not found then raise sqlstate 'PT404' using message = 'EVENT_NOT_FOUND'; end if;
  return v_name;
end $$;

create or replace function public.delete_event(p_event_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise insufficient_privilege using message = 'Autenticacion requerida'; end if;

  -- El DELETE bloquea la misma fila que el envío público. Las FK limpian solicitudes y recibos.
  delete from public.events e
  where e.id = p_event_id and exists (
    select 1 from public.workspace_members m
    where m.workspace_id = e.workspace_id and m.user_id = v_user and m.role = 'owner'
  );
  if not found then raise sqlstate 'PT404' using message = 'EVENT_NOT_FOUND'; end if;
end $$;

revoke all on function public.rename_event(uuid, text), public.delete_event(uuid) from public, anon, authenticated, service_role;
grant execute on function public.rename_event(uuid, text), public.delete_event(uuid) to authenticated;

commit;
