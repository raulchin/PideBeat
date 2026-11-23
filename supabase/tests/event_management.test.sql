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
create temporary table event_fixture as select * from public.events with no data;
grant select, insert on event_fixture to authenticated, service_role;
grant usage on schema extensions to authenticated, anon, service_role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
insert into event_fixture select * from public.create_event('Evento de prueba');
reset role;
insert into public.workspace_members(workspace_id, user_id, role)
select workspace_id, '00000000-0000-4000-8000-000000000003', 'staff' from event_fixture;

set local role service_role;
select is(submit_public_song_request((select public_code from event_fixture), 'Tema', 'Artista',
  gen_random_uuid(), repeat('a', 64)), '{"ok":true}'::jsonb, 'Solicitud previa guardada');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
select throws_ok($$select rename_event((select id from event_fixture), 'Ajeno')$$,
  'PT404', 'EVENT_NOT_FOUND', 'Otro DJ no edita un evento ajeno');
select throws_ok($$select delete_event((select id from event_fixture))$$,
  'PT404', 'EVENT_NOT_FOUND', 'Otro DJ no elimina un evento ajeno');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
select throws_ok($$select rename_event((select id from event_fixture), 'Staff')$$,
  'PT404', 'EVENT_NOT_FOUND', 'Staff no cambia el nombre');
select throws_ok($$select delete_event((select id from event_fixture))$$,
  'PT404', 'EVENT_NOT_FOUND', 'Staff no elimina');

set local role anon;
select throws_ok($$select rename_event(null, 'Publico')$$, '42501', null, 'Invitado no ejecuta edición');
select throws_ok($$select delete_event(null)$$, '42501', null, 'Invitado no ejecuta eliminación');

set local role authenticated;
set local request.jwt.claim.sub = '';
select throws_ok($$select delete_event((select id from event_fixture))$$, '42501', null, 'El borrado exige un usuario');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select throws_ok($$select rename_event((select id from event_fixture), '  ')$$,
  'PT400', 'INVALID_INPUT', 'Nombre vacío rechazado');
select throws_ok($$select rename_event((select id from event_fixture), repeat('a', 121))$$,
  'PT400', 'INVALID_INPUT', 'Nombre demasiado largo rechazado');
select throws_ok($$update public.events set public_code = repeat('b', 32)$$, '42501', null, 'Código QR no editable directamente');
select throws_ok($$delete from public.events$$, '42501', null, 'Borrado directo no permitido');
select is(rename_event((select id from event_fixture), '  Fiesta nueva  '), 'Fiesta nueva', 'Owner edita y normaliza el nombre');
select results_eq(
  $$select id, workspace_id, public_code, is_active, created_at, closed_at from events$$,
  $$select id, workspace_id, public_code, is_active, created_at, closed_at from event_fixture$$,
  'Editar conserva ID, workspace, QR, fechas y estado'
);
select is((select count(*) from song_requests), 1::bigint, 'Editar conserva solicitudes');

set local role service_role;
select is(lookup_public_event((select public_code from event_fixture)),
  '{"name":"Fiesta nueva","is_active":true}'::jsonb, 'El QR original muestra el nombre nuevo');

set local role authenticated;
select lives_ok($$select close_event((select id from event_fixture))$$, 'Cerrar sigue disponible');
select is(rename_event((select id from event_fixture), 'Fiesta cerrada'), 'Fiesta cerrada', 'Se permite editar un evento cerrado');
select ok((select not is_active and closed_at is not null from events), 'Editar no reabre el evento');
select lives_ok($$select delete_event((select id from event_fixture))$$, 'Owner puede eliminar');

set local role service_role;
select throws_ok($$select lookup_public_event((select public_code from event_fixture))$$,
  'PT404', 'EVENT_NOT_FOUND', 'El enlace se invalida solo al eliminar');
select throws_ok($$select submit_public_song_request((select public_code from event_fixture), 'Tema', 'Artista', gen_random_uuid(), repeat('a',64))$$,
  'PT404', 'EVENT_NOT_FOUND', 'No se aceptan pedidos para un evento eliminado');
reset role;
select is((select count(*) from events where id = (select id from event_fixture)), 0::bigint, 'Evento eliminado de la base');
select is((select count(*) from song_requests where event_id = (select id from event_fixture)), 0::bigint, 'Se limpian las solicitudes asociadas');
select is((select count(*) from private.request_receipts where event_id = (select id from event_fixture)), 0::bigint, 'Se limpian los recibos asociados');
select ok((select pubinsert and pubupdate and not pubdelete and not pubtruncate
  from pg_publication where pubname = 'supabase_realtime'), 'Solo se publican altas y cambios de Realtime');

select * from finish();
rollback;
