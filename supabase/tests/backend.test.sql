begin;
create schema if not exists extensions;
do $$ begin
  if to_regprocedure('extensions.plan(integer)') is null then
    create extension if not exists pgtap with schema extensions;
  end if;
end $$;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003');
create temporary table fixture(label text primary key, workspace_id uuid, event_id uuid, public_code text);
grant select, insert on fixture to authenticated, service_role;
grant usage on schema extensions to authenticated, anon, service_role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
insert into fixture select 'A', e.workspace_id, e.id, e.public_code from public.create_event('  Fiesta A  ') e;
insert into fixture select 'aggregate', e.workspace_id, e.id, e.public_code from public.create_event('Limite agregado') e;
select is(ensure_personal_workspace(), (select workspace_id from fixture where label = 'A'), 'Workspace personal idempotente');
select is((select count(*) from workspaces), 1::bigint, 'A solo ve su workspace');
select is((select name from events where id = (select event_id from fixture where label = 'A')), 'Fiesta A', 'Nombre normalizado');
select ok((select public_code ~ '^[0-9a-f]{32}$' from fixture where label = 'A'), 'Codigo criptografico de 128 bits');
select throws_ok($$select create_event('   ')$$, 'PT400', 'INVALID_INPUT', 'Evento vacio rechazado');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
insert into fixture select 'B', e.workspace_id, e.id, e.public_code from public.create_event('Fiesta B') e;
select isnt((select workspace_id from fixture where label = 'A'), ensure_personal_workspace(), 'B tiene workspace independiente');
select is((select count(*) from events), 1::bigint, 'B no lista eventos de A');
select is((select count(*) from workspace_members), 1::bigint, 'B solo ve su membresia sin recursion');
select throws_ok($$select close_event((select event_id from fixture where label = 'A'))$$, 'PT404', 'EVENT_NOT_FOUND', 'B no cierra evento de A');
select throws_ok($$insert into workspace_members(workspace_id,user_id,role) select workspace_id,auth.uid(),'owner' from fixture where label='A'$$,
  '42501', null, 'B no se asocia al workspace de A');
select throws_ok($$update workspace_members set role='owner'$$, '42501', null, 'Cliente no modifica roles');
select throws_ok($$update events set is_active=false$$, '42501', null, 'Cliente no modifica eventos directamente');
select throws_ok($$insert into events(workspace_id,name) select workspace_id,'Fraude' from fixture where label='A'$$,
  '42501', null, 'Cliente no crea eventos con workspace arbitrario');
select throws_ok($$select lookup_public_event(repeat('a',32))$$, '42501', null, 'Authenticated no ejecuta lookup privilegiado');
select throws_ok($$select submit_public_song_request(repeat('a',32),'Tema','Artista',gen_random_uuid(),repeat('a',64))$$,
  '42501', null, 'Authenticated no ejecuta submit privilegiado');
select throws_ok($$select * from private.request_receipts$$, '42501', null, 'Authenticated no lee hashes');

reset role;
insert into workspace_members(workspace_id,user_id,role)
select workspace_id,'00000000-0000-4000-8000-000000000003','staff' from fixture where label='A';

set local role service_role;
select is(lookup_public_event((select public_code from fixture where label='A')),
  '{"name":"Fiesta A","is_active":true}'::jsonb, 'Lookup solo devuelve nombre y disponibilidad');
select throws_ok($$select lookup_public_event(repeat('f',32))$$, 'PT404', 'EVENT_NOT_FOUND', 'Codigo inexistente');
select throws_ok($$select lookup_public_event('incorrecto')$$, 'PT400', 'INVALID_INPUT', 'Codigo invalido');
select is(submit_public_song_request((select public_code from fixture where label='A'),'  Tema  ',' Artista ',
  '10000000-0000-4000-8000-000000000001',repeat('a',64)), '{"ok":true}'::jsonb, 'Envio persistido');
select is(submit_public_song_request((select public_code from fixture where label='A'),'Tema','Artista',
  '10000000-0000-4000-8000-000000000001',repeat('a',64)), '{"ok":true}'::jsonb, 'Reintento idempotente');
select throws_ok($$select submit_public_song_request((select public_code from fixture where label='A'),'Otro','Artista',
  '10000000-0000-4000-8000-000000000001',repeat('a',64))$$, 'PT409', 'IDEMPOTENCY_CONFLICT', 'Mismo UUID con otro texto rechazado');
select throws_ok($$select submit_public_song_request((select public_code from fixture where label='A'),'Tema','Artista',
  '10000000-0000-4000-8000-000000000001',repeat('b',64))$$, 'PT409', 'IDEMPOTENCY_CONFLICT', 'Mismo UUID con otro origen rechazado');
select throws_ok($$select submit_public_song_request((select public_code from fixture where label='A'),'  ','Artista',gen_random_uuid(),repeat('a',64))$$,
  'PT400', 'INVALID_INPUT', 'SQL valida texto vacio');
select throws_ok($$select submit_public_song_request((select public_code from fixture where label='A'),repeat('a',121),'Artista',gen_random_uuid(),repeat('a',64))$$,
  'PT400', 'INVALID_INPUT', 'SQL valida longitud');
select throws_ok($$select submit_public_song_request((select public_code from fixture where label='A'),'Tema','Artista',null,repeat('a',64))$$,
  'PT400', 'INVALID_INPUT', 'UUID obligatorio');
select throws_ok($$select submit_public_song_request((select public_code from fixture where label='A'),'Tema','Artista',gen_random_uuid(),'IP')$$,
  'PT400', 'INVALID_INPUT', 'Solo hash HMAC valido');
select lives_ok($$select submit_public_song_request((select public_code from fixture where label='A'),'Tema','Artista',gen_random_uuid(),repeat('a',64)) from generate_series(1,2)$$, 'Completar cuota por origen');
select throws_ok($$select submit_public_song_request((select public_code from fixture where label='A'),'Tema','Artista',gen_random_uuid(),repeat('a',64))$$,
  'PT429', 'RATE_LIMITED', 'Cuarta solicitud del origen rechazada');
select is(submit_public_song_request((select public_code from fixture where label='A'),'Tema','Artista',
  '10000000-0000-4000-8000-000000000001',repeat('a',64)), '{"ok":true}'::jsonb, 'Idempotencia antes del limite');
select lives_ok($$select submit_public_song_request((select public_code from fixture where label='aggregate'),'Tema','Artista',gen_random_uuid(),lpad(to_hex(i),64,'0'))
from generate_series(1,120) i$$, 'Completar cuota agregada');
select throws_ok($$select submit_public_song_request((select public_code from fixture where label='aggregate'),'Tema','Artista',gen_random_uuid(),repeat('f',64))$$,
  'PT429', 'RATE_LIMITED', 'Limite agregado aunque cambie el origen');
select lives_ok($$select submit_public_song_request((select public_code from fixture where label='B'),'Tema B','Artista B',gen_random_uuid(),repeat('a',64))$$, 'B recibe solicitud independiente');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
select is((select count(*) from song_requests), 1::bigint, 'B no ve canciones de A');
with changed as (update song_requests set status='ATENDIDA' where event_id=(select event_id from fixture where label='A') returning id)
select is((select count(*) from changed), 0::bigint, 'B no actualiza canciones de A con ID conocido');
select throws_ok($$update song_requests set song_title='Alterado'$$, '42501', null, 'UPDATE limitado por columna: titulo');
select throws_ok($$update song_requests set event_id=(select event_id from fixture where label='A')$$, '42501', null, 'No se trasladan solicitudes entre eventos');
select throws_ok($$insert into song_requests(event_id,song_title,artist) select event_id,'Tema','Artista' from fixture where label='B'$$,
  '42501', null, 'No se omite antispam con INSERT directo');
select throws_ok($$delete from song_requests$$, '42501', null, 'No se borran solicitudes');
select lives_ok($$update song_requests set status='ATENDIDA'$$, 'Owner actualiza status sin permisos adicionales');
select is((select status from song_requests limit 1), 'ATENDIDA', 'Estado guardado');
select throws_ok($$update song_requests set status='FALSO'$$, '23514', null, 'Constraint de estados');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
select is((select count(*) from events), 2::bigint, 'Staff lee eventos de su membresia');
with changed as (update song_requests set status='RECHAZADA' returning id)
select is((select count(*) from changed), 0::bigint, 'Staff no modifica estados');
select throws_ok($$select close_event((select event_id from fixture where label='A'))$$, 'PT404', 'EVENT_NOT_FOUND', 'Staff no cierra evento');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select lives_ok($$select close_event((select event_id from fixture where label='A'))$$, 'Owner cierra evento');
select lives_ok($$select close_event((select event_id from fixture where label='A'))$$, 'Cierre idempotente');
select ok((select not is_active and closed_at is not null from events where id=(select event_id from fixture where label='A')), 'Cierre consistente');
set local role service_role;
select is(lookup_public_event((select public_code from fixture where label='A'))->>'is_active', 'false', 'Lookup indica cierre');
select throws_ok($$select submit_public_song_request((select public_code from fixture where label='A'),'Tema','Artista',gen_random_uuid(),repeat('c',64))$$,
  'PT409', 'EVENT_CLOSED', 'Cierre se valida en servidor');
select is(submit_public_song_request((select public_code from fixture where label='A'),'Tema','Artista',
  '10000000-0000-4000-8000-000000000001',repeat('a',64)), '{"ok":true}'::jsonb, 'Exito previo se recupera tras cierre');

reset role;
select is((select count(*) from song_requests where event_id=(select event_id from fixture where label='A')), 3::bigint, 'No duplicados ni inserciones en fallos');
update private.request_receipts set accepted_at=clock_timestamp()-interval '61 seconds' where event_id=(select event_id from fixture where label='aggregate');
set local role service_role;
select lives_ok($$select submit_public_song_request((select public_code from fixture where label='aggregate'),'Tema','Artista',gen_random_uuid(),repeat('f',64))$$,
  'Cuota se recupera al pasar ventana deslizante');

set local role anon;
select throws_ok($$select * from events$$, '42501', null, 'Anon no lista eventos');
select throws_ok($$select * from workspaces$$, '42501', null, 'Anon no lista workspaces');
select throws_ok($$select * from workspace_members$$, '42501', null, 'Anon no lista miembros');
select throws_ok($$select * from song_requests$$, '42501', null, 'Anon no lista canciones');
select throws_ok($$update song_requests set status='ATENDIDA'$$, '42501', null, 'Anon no modifica canciones');
select throws_ok($$delete from song_requests$$, '42501', null, 'Anon no borra canciones');
select throws_ok($$insert into song_requests(event_id,song_title,artist) values(gen_random_uuid(),'Tema','Artista')$$,
  '42501', null, 'Anon no inserta canciones');
select throws_ok($$select ensure_personal_workspace()$$, '42501', null, 'Anon no aprovisiona workspace');
select throws_ok($$select lookup_public_event(repeat('a',32))$$, '42501', null, 'Anon no ejecuta lookup SQL');
select throws_ok($$select submit_public_song_request(repeat('a',32),'Tema','Artista',gen_random_uuid(),repeat('a',64))$$,
  '42501', null, 'Anon no ejecuta submit SQL');

reset role;
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prosecdef
    and not coalesce(p.proconfig @> array['search_path=""'], false)
), 'Todas las SECURITY DEFINER fijan search_path vacio');
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='song_requests'), 'Bandeja publicada en Realtime');
select ok(not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='private'), 'Hashes fuera de Realtime');
select * from finish();
rollback;
