begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema private;
revoke all on schema private from public, anon, authenticated, service_role;
revoke create on schema public from public, anon, authenticated;

-- Coincide con String.trim(): tambien elimina espacios Unicode en los extremos.
create function private.clean_text(p_value text) returns text
language sql immutable strict set search_path = ''
as $$ select btrim(p_value, U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') $$;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120 and name = private.clean_text(name)),
  created_at timestamptz not null default now()
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members(user_id);
-- Mapa interno unico: no se puede reclamar una cuenta mediante metadatos del JWT.
create table private.personal_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120 and name = private.clean_text(name) and name !~ '[[:cntrl:]]'),
  public_code text not null unique default encode(extensions.gen_random_bytes(16), 'hex')
    check (public_code ~ '^[0-9a-f]{32}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (is_active = (closed_at is null))
);
create index events_workspace_idx on public.events(workspace_id);
create table public.song_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  song_title text not null check (char_length(song_title) between 2 and 120 and song_title = private.clean_text(song_title) and song_title !~ '[[:cntrl:]]'),
  artist text not null check (char_length(artist) between 2 and 120 and artist = private.clean_text(artist) and artist !~ '[[:cntrl:]]'),
  status text not null default 'PENDIENTE' check (status in ('PENDIENTE', 'ATENDIDA', 'RECHAZADA')),
  created_at timestamptz not null default now()
);
create index song_requests_event_date_idx on public.song_requests(event_id, created_at desc);
create table private.request_receipts (
  event_id uuid not null references public.events(id) on delete cascade,
  request_id uuid not null,
  origin_hash text not null check (origin_hash ~ '^[0-9a-f]{64}$'),
  song_request_id uuid not null unique references public.song_requests(id) on delete cascade,
  accepted_at timestamptz not null,
  primary key (event_id, request_id)
);
create index request_receipts_event_date_idx on private.request_receipts(event_id, accepted_at);
create index request_receipts_origin_date_idx on private.request_receipts(event_id, origin_hash, accepted_at);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.events enable row level security;
alter table public.song_requests enable row level security;
alter table private.personal_workspaces enable row level security;
alter table private.request_receipts enable row level security;

create policy own_membership on public.workspace_members for select to authenticated
using (user_id = (select auth.uid()));
create policy member_workspace on public.workspaces for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = id and m.user_id = (select auth.uid())));
create policy member_events on public.events for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = events.workspace_id and m.user_id = (select auth.uid())));
create policy member_requests on public.song_requests for select to authenticated
using (exists (select 1 from public.events e where e.id = event_id));
create policy owner_request_status on public.song_requests for update to authenticated
using (exists (
  select 1 from public.events e join public.workspace_members m on m.workspace_id = e.workspace_id
  where e.id = event_id and m.user_id = (select auth.uid()) and m.role = 'owner'
)) with check (exists (
  select 1 from public.events e join public.workspace_members m on m.workspace_id = e.workspace_id
  where e.id = event_id and m.user_id = (select auth.uid()) and m.role = 'owner'
));

revoke all on public.workspaces, public.workspace_members, public.events, public.song_requests
  from public, anon, authenticated;
grant usage on schema public to authenticated, service_role;
grant select on public.workspaces, public.workspace_members, public.events, public.song_requests to authenticated;
grant update (status) on public.song_requests to authenticated;
revoke all on all tables in schema private from public, anon, authenticated, service_role;

create function public.ensure_personal_workspace() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_workspace uuid;
begin
  if v_user is null then raise insufficient_privilege using message = 'Autenticacion requerida'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select workspace_id into v_workspace from private.personal_workspaces where user_id = v_user;
  if v_workspace is null then
    insert into public.workspaces(name) values ('Mi espacio PideBeat') returning id into v_workspace;
    insert into public.workspace_members(workspace_id, user_id, role) values (v_workspace, v_user, 'owner');
    insert into private.personal_workspaces(user_id, workspace_id) values (v_user, v_workspace);
  end if;
  return v_workspace;
end $$;

create function public.create_event(p_name text) returns public.events
language plpgsql security definer set search_path = '' as $$
declare
  v_workspace uuid;
  v_event public.events;
  v_name text := private.clean_text(p_name);
begin
  if v_name is null or char_length(v_name) not between 1 and 120 or v_name ~ '[[:cntrl:]]' then
    raise sqlstate 'PT400' using message = 'INVALID_INPUT';
  end if;
  v_workspace := public.ensure_personal_workspace();
  if not exists (select 1 from public.workspace_members where workspace_id = v_workspace and user_id = auth.uid() and role = 'owner') then
    raise insufficient_privilege using message = 'Se requiere propietario';
  end if;
  insert into public.events(workspace_id, name) values (v_workspace, v_name) returning * into v_event;
  return v_event;
end $$;

create function public.close_event(p_event_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise insufficient_privilege using message = 'Autenticacion requerida'; end if;
  -- UPDATE toma el mismo bloqueo de fila que submit_public_song_request.
  update public.events e set is_active = false, closed_at = coalesce(closed_at, clock_timestamp())
  where e.id = p_event_id and exists (
    select 1 from public.workspace_members m where m.workspace_id = e.workspace_id
      and m.user_id = auth.uid() and m.role = 'owner'
  );
  if not found then raise sqlstate 'PT404' using message = 'EVENT_NOT_FOUND'; end if;
end $$;

create function public.lookup_public_event(p_public_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if p_public_code is null or p_public_code !~ '^[0-9a-f]{32}$' then
    raise sqlstate 'PT400' using message = 'INVALID_INPUT';
  end if;
  select jsonb_build_object('name', name, 'is_active', is_active) into v_result
  from public.events where public_code = p_public_code;
  if not found then raise sqlstate 'PT404' using message = 'EVENT_NOT_FOUND'; end if;
  return v_result;
end $$;

create function public.submit_public_song_request(
  p_public_code text, p_song_title text, p_artist text, p_request_id uuid, p_origin_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events;
  v_receipt private.request_receipts;
  v_song public.song_requests;
  v_title text := private.clean_text(p_song_title);
  v_artist text := private.clean_text(p_artist);
  v_now timestamptz;
begin
  if p_public_code is null or p_public_code !~ '^[0-9a-f]{32}$'
    or p_origin_hash is null or p_origin_hash !~ '^[0-9a-f]{64}$' or p_request_id is null
    or v_title is null or char_length(v_title) not between 2 and 120 or v_title ~ '[[:cntrl:]]'
    or v_artist is null or char_length(v_artist) not between 2 and 120 or v_artist ~ '[[:cntrl:]]' then
    raise sqlstate 'PT400' using message = 'INVALID_INPUT';
  end if;
  select * into v_event from public.events where public_code = p_public_code for update;
  if not found then raise sqlstate 'PT404' using message = 'EVENT_NOT_FOUND'; end if;
  -- El reintento de un exito no consume cuota, incluso despues de cerrar el evento.
  select * into v_receipt from private.request_receipts where event_id = v_event.id and request_id = p_request_id;
  if found then
    select * into strict v_song from public.song_requests where id = v_receipt.song_request_id;
    if v_receipt.origin_hash <> p_origin_hash or v_song.song_title <> v_title or v_song.artist <> v_artist then
      raise sqlstate 'PT409' using message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('ok', true);
  end if;
  if not v_event.is_active then raise sqlstate 'PT409' using message = 'EVENT_CLOSED'; end if;
  v_now := clock_timestamp();
  if (select count(*) from private.request_receipts where event_id = v_event.id
      and origin_hash = p_origin_hash and accepted_at > v_now - interval '60 seconds') >= 3
    or (select count(*) from private.request_receipts where event_id = v_event.id
      and accepted_at > v_now - interval '60 seconds') >= 120 then
    raise sqlstate 'PT429' using message = 'RATE_LIMITED';
  end if;
  insert into public.song_requests(event_id, song_title, artist, created_at)
    values (v_event.id, v_title, v_artist, v_now) returning * into v_song;
  insert into private.request_receipts(event_id, request_id, origin_hash, song_request_id, accepted_at)
    values (v_event.id, p_request_id, p_origin_hash, v_song.id, v_now);
  return jsonb_build_object('ok', true);
end $$;

-- PostgreSQL concede EXECUTE a PUBLIC al crear funciones: revocarlo explicitamente.
revoke all on function private.clean_text(text) from public, anon, authenticated, service_role;
-- Los CHECK tambien se evaluan al actualizar status bajo el rol authenticated.
grant usage on schema private to authenticated;
grant execute on function private.clean_text(text) to authenticated;
revoke all on function public.ensure_personal_workspace(), public.create_event(text), public.close_event(uuid),
  public.lookup_public_event(text), public.submit_public_song_request(text, text, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.ensure_personal_workspace(), public.create_event(text), public.close_event(uuid) to authenticated;
grant execute on function public.lookup_public_event(text), public.submit_public_song_request(text, text, text, uuid, text) to service_role;

-- Solo datos de la bandeja, nunca recibos ni hashes de origen en Realtime.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter publication supabase_realtime add table public.song_requests;
commit;
