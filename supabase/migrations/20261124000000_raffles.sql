begin;

create table public.raffles (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  prize_name text not null check (char_length(prize_name) between 1 and 120),
  description text not null check (char_length(description) <= 500),
  terms text not null check (char_length(terms) between 1 and 1000),
  terms_version integer not null default 1 check (terms_version > 0),
  closes_at timestamptz not null check (isfinite(closes_at)),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  closed_at timestamptz,
  check (closed_at is null or opened_at is not null)
);

create table public.raffle_entries (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 60),
  accepted_at timestamptz not null,
  terms_version integer not null check (terms_version > 0),
  browser_hash text not null,
  receipt_hash text not null,
  origin_key text not null,
  unique (raffle_id, id),
  unique (raffle_id, browser_hash),
  unique (raffle_id, receipt_hash)
);
create index raffle_entries_origin_idx on public.raffle_entries(raffle_id, origin_key, accepted_at);

create table public.raffle_draws (
  raffle_id uuid primary key,
  winner_entry_id uuid not null,
  winner_name text not null,
  eligible_count bigint not null check (eligible_count > 0),
  drawn_by uuid not null,
  drawn_at timestamptz not null,
  foreign key (raffle_id, winner_entry_id) references public.raffle_entries(raffle_id, id) on delete cascade
);

alter table public.raffles enable row level security;
alter table public.raffle_entries enable row level security;
alter table public.raffle_draws enable row level security;

create function private.owns_event(p_event_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.events e join public.workspace_members m on m.workspace_id = e.workspace_id
    where e.id = p_event_id and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;
revoke all on function private.owns_event(uuid) from public, anon, authenticated, service_role;
grant execute on function private.owns_event(uuid) to authenticated;

create policy raffle_owner on public.raffles for select to authenticated
using (private.owns_event(event_id));
create policy raffle_entries_owner on public.raffle_entries for select to authenticated
using (exists (select 1 from public.raffles r where r.id = raffle_id));
create policy raffle_draws_owner on public.raffle_draws for select to authenticated
using (exists (select 1 from public.raffles r where r.id = raffle_id));

revoke all on public.raffles, public.raffle_entries, public.raffle_draws from public, anon, authenticated, service_role;
grant select on public.raffles, public.raffle_draws to authenticated;
grant select (id, raffle_id, display_name, accepted_at, terms_version) on public.raffle_entries to authenticated;

create function public.save_raffle(
  p_event_id uuid, p_prize_name text, p_description text, p_terms text, p_closes_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_prize text := private.clean_text(p_prize_name);
  v_description text := private.clean_text(coalesce(p_description, ''));
  v_terms text := private.clean_text(p_terms);
begin
  if not private.owns_event(p_event_id) then
    raise sqlstate 'PT404' using message = 'RAFFLE_NOT_FOUND';
  end if;
  if v_prize is null or char_length(v_prize) not between 1 and 120 or v_prize ~ '[[:cntrl:]]'
    or char_length(v_description) > 500 or v_terms is null or char_length(v_terms) not between 1 and 1000
    or p_closes_at is null or not isfinite(p_closes_at) or p_closes_at <= clock_timestamp() then
    raise sqlstate 'PT400' using message = 'INVALID_RAFFLE';
  end if;
  insert into public.raffles as r(event_id, prize_name, description, terms, closes_at)
  values (p_event_id, v_prize, v_description, v_terms, p_closes_at)
  on conflict (event_id) do update set prize_name = excluded.prize_name, description = excluded.description,
    terms = excluded.terms, closes_at = excluded.closes_at, terms_version = r.terms_version + 1
    where r.opened_at is null;
  if not found then raise sqlstate 'PT409' using message = 'RAFFLE_LOCKED'; end if;
end $$;

create function public.activate_raffle(p_event_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_raffle public.raffles;
  v_active boolean;
  v_now timestamptz;
begin
  if not private.owns_event(p_event_id) then raise sqlstate 'PT404' using message = 'RAFFLE_NOT_FOUND'; end if;
  select is_active into v_active from public.events where id = p_event_id for share;
  select * into v_raffle from public.raffles where event_id = p_event_id for update;
  if not found then raise sqlstate 'PT404' using message = 'RAFFLE_NOT_FOUND'; end if;
  v_now := clock_timestamp();
  if v_active is not true or v_raffle.closed_at is not null or v_raffle.closes_at <= v_now then
    raise sqlstate 'PT409' using message = 'RAFFLE_CLOSED';
  end if;
  if v_raffle.opened_at is null then update public.raffles set opened_at = v_now where id = v_raffle.id; end if;
end $$;

create function public.close_raffle(p_event_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.owns_event(p_event_id) then raise sqlstate 'PT404' using message = 'RAFFLE_NOT_FOUND'; end if;
  update public.raffles set closed_at = coalesce(closed_at, clock_timestamp())
  where event_id = p_event_id and opened_at is not null;
  if not found then raise sqlstate 'PT404' using message = 'RAFFLE_NOT_FOUND'; end if;
end $$;

create function private.raffle_random_index(p_count bigint) returns bigint
language plpgsql volatile set search_path = '' as $$
declare
  v_bytes bytea;
  v_value bigint;
  v_range constant bigint := 4294967296;
begin
  if p_count is null or p_count < 1 or p_count > v_range then raise exception 'Cantidad fuera de rango'; end if;
  loop
    v_bytes := extensions.gen_random_bytes(4);
    v_value := (get_byte(v_bytes, 0)::bigint << 24) + (get_byte(v_bytes, 1)::bigint << 16)
      + (get_byte(v_bytes, 2)::bigint << 8) + get_byte(v_bytes, 3);
    -- El descarte de la cola evita sesgo si la cantidad no divide 2^32.
    if v_value < v_range - mod(v_range, p_count) then return mod(v_value, p_count); end if;
  end loop;
end $$;

create function public.draw_raffle(p_event_id uuid) returns public.raffle_draws
language plpgsql security definer set search_path = '' as $$
declare
  v_raffle public.raffles;
  v_draw public.raffle_draws;
  v_entry public.raffle_entries;
  v_count bigint;
begin
  if not private.owns_event(p_event_id) then raise sqlstate 'PT404' using message = 'RAFFLE_NOT_FOUND'; end if;
  select * into v_raffle from public.raffles where event_id = p_event_id for update;
  if not found then raise sqlstate 'PT404' using message = 'RAFFLE_NOT_FOUND'; end if;
  select * into v_draw from public.raffle_draws where raffle_id = v_raffle.id;
  if found then return v_draw; end if;
  if v_raffle.opened_at is null then raise sqlstate 'PT409' using message = 'RAFFLE_NOT_OPENED'; end if;
  if v_raffle.closed_at is null and v_raffle.closes_at > clock_timestamp()
    and exists (select 1 from public.events where id = p_event_id and is_active) then
    raise sqlstate 'PT409' using message = 'RAFFLE_STILL_OPEN';
  end if;
  select count(*) into v_count from public.raffle_entries where raffle_id = v_raffle.id;
  if v_count = 0 then raise sqlstate 'PT409' using message = 'RAFFLE_EMPTY'; end if;
  select * into strict v_entry from public.raffle_entries where raffle_id = v_raffle.id
    order by id offset private.raffle_random_index(v_count) limit 1;
  insert into public.raffle_draws(raffle_id, winner_entry_id, winner_name, eligible_count, drawn_by, drawn_at)
  values (v_raffle.id, v_entry.id, v_entry.display_name, v_count, auth.uid(), clock_timestamp())
  returning * into v_draw;
  return v_draw;
end $$;

revoke all on function private.raffle_random_index(bigint) from public, anon, authenticated, service_role;
revoke all on function public.save_raffle(uuid, text, text, text, timestamptz), public.activate_raffle(uuid),
  public.close_raffle(uuid), public.draw_raffle(uuid) from public, anon, authenticated, service_role;
grant execute on function public.save_raffle(uuid, text, text, text, timestamptz), public.activate_raffle(uuid),
  public.close_raffle(uuid), public.draw_raffle(uuid) to authenticated;

commit;
