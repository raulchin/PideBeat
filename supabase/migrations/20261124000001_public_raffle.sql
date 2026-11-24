begin;

create function public.lookup_public_raffle(p_code text, p_request_id uuid, p_origin_hash text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('prize_name', r.prize_name, 'description', r.description,
      'terms', r.terms, 'terms_version', r.terms_version, 'closes_at', r.closes_at)
    from public.raffles r
    join public.events e on e.id = r.event_id
    join private.request_receipts s on s.event_id = e.id and s.request_id = p_request_id
    where e.public_code = p_code and s.origin_hash = p_origin_hash and e.is_active
      and r.opened_at is not null and r.closed_at is null and r.closes_at > statement_timestamp()
      and s.accepted_at >= r.opened_at
  ), 'null'::jsonb);
$$;

create function public.enter_public_raffle(
  p_code text, p_request_id uuid, p_origin_hash text, p_browser_id uuid,
  p_name text, p_accepted boolean, p_terms_version integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events;
  v_raffle public.raffles;
  v_receipt private.request_receipts;
  v_name text := private.clean_text(p_name);
  v_now timestamptz;
  v_browser text;
  v_receipt_key text;
  v_origin text;
begin
  if p_accepted is not true or p_terms_version is null or p_browser_id is null or p_request_id is null
    or v_name is null or char_length(v_name) not between 2 and 60 or v_name ~ '[[:cntrl:]]' then
    raise sqlstate 'PT400' using message = 'INVALID_ENTRY';
  end if;
  -- Cierre del evento, inscripción y borrado no pueden saltarse entre sí.
  select * into v_event from public.events where public_code = p_code for share;
  select * into v_receipt from private.request_receipts
    where event_id = v_event.id and request_id = p_request_id and origin_hash = p_origin_hash;
  if not found then raise sqlstate 'PT404' using message = 'RAFFLE_NOT_AVAILABLE'; end if;
  select * into v_raffle from public.raffles where event_id = v_event.id for update;
  if not found or v_raffle.opened_at is null or v_receipt.accepted_at < v_raffle.opened_at then
    raise sqlstate 'PT404' using message = 'RAFFLE_NOT_AVAILABLE';
  end if;
  if p_terms_version <> v_raffle.terms_version then raise sqlstate 'PT409' using message = 'RAFFLE_TERMS_CHANGED'; end if;

  v_browser := encode(extensions.digest(v_raffle.id::text || ':browser:' || p_browser_id::text, 'sha256'), 'hex');
  v_receipt_key := encode(extensions.digest(v_raffle.id::text || ':receipt:' || p_request_id::text, 'sha256'), 'hex');
  v_origin := encode(extensions.digest(v_raffle.id::text || ':origin:' || p_origin_hash, 'sha256'), 'hex');
  if exists (select 1 from public.raffle_entries where raffle_id = v_raffle.id
    and (browser_hash = v_browser or receipt_hash = v_receipt_key)) then
    return jsonb_build_object('status', 'ALREADY_ENTERED');
  end if;
  v_now := clock_timestamp();
  if not v_event.is_active or v_raffle.closed_at is not null or v_raffle.closes_at <= v_now then
    raise sqlstate 'PT409' using message = 'RAFFLE_CLOSED';
  end if;
  if (select count(*) from public.raffle_entries where raffle_id = v_raffle.id
    and origin_key = v_origin and accepted_at > v_now - interval '60 seconds') >= 20 then
    raise sqlstate 'PT429' using message = 'RAFFLE_RATE_LIMITED';
  end if;
  insert into public.raffle_entries(raffle_id, display_name, accepted_at, terms_version, browser_hash, receipt_hash, origin_key)
    values (v_raffle.id, v_name, v_now, p_terms_version, v_browser, v_receipt_key, v_origin);
  return jsonb_build_object('status', 'ENTERED');
end $$;

revoke all on function public.lookup_public_raffle(text, uuid, text),
  public.enter_public_raffle(text, uuid, text, uuid, text, boolean, integer) from public, anon, authenticated, service_role;
grant execute on function public.lookup_public_raffle(text, uuid, text),
  public.enter_public_raffle(text, uuid, text, uuid, text, boolean, integer) to service_role;

commit;
