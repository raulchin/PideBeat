begin;
do $$ begin
  if to_regprocedure('extensions.plan(integer)') is null then create extension if not exists pgtap with schema extensions; end if;
end $$;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
create temporary table fixtures(label text primary key, event_id uuid, code text);
grant select, insert on fixtures to authenticated, service_role, anon;
grant usage on schema extensions to authenticated, service_role, anon;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
insert into fixtures select 'A', id, public_code from create_event('Fiesta A');
insert into fixtures select 'B', id, public_code from create_event('Fiesta B');
select lives_ok($$select save_raffle(event_id,'Un premio','Descripción','Condiciones iniciales',now()+interval '1 hour')
  from fixtures where label='A'$$, 'Crea un borrador');
select lives_ok($$select save_raffle(event_id,'Premio final','Descripción','Aceptar condiciones',now()+interval '1 hour')
  from fixtures where label='A'$$, 'Edita el mismo borrador');
select is((select count(*) from raffles where event_id=(select event_id from fixtures where label='A')),1::bigint,'Solo un sorteo por evento');
select is((select terms_version from raffles),2,'Conserva versión de condiciones');
select throws_ok($$select draw_raffle(event_id) from fixtures where label='A'$$,'PT409','RAFFLE_NOT_OPENED','No sortea un borrador');

set local role service_role;
select is(submit_public_song_request((select code from fixtures where label='A'),'Tema','Artista',
  '10000000-0000-4000-8000-000000000001',repeat('a',64)),'{"ok":true}'::jsonb,'El envío musical no cambia');
select is(lookup_public_raffle((select code from fixtures where label='A'),'10000000-0000-4000-8000-000000000001',repeat('a',64)),
  'null'::jsonb,'No invita en borrador');

set local role authenticated;
select lives_ok($$select activate_raffle(event_id) from fixtures where label='A'$$,'Activa el sorteo');
select throws_ok($$select save_raffle(event_id,'Otro','', 'Otras', now()+interval '1 hour') from fixtures where label='A'$$,
  'PT409','RAFFLE_LOCKED','No cambia condiciones activadas');
select throws_ok($$select draw_raffle(event_id) from fixtures where label='A'$$,'PT409','RAFFLE_STILL_OPEN','Exige cierre de inscripciones');

set local role service_role;
select is(lookup_public_raffle((select code from fixtures where label='A'),'10000000-0000-4000-8000-000000000001',repeat('a',64)),
  'null'::jsonb,'No invita para pedidos anteriores a la activación');
select lives_ok($$select submit_public_song_request(code,'Tema 2','Artista','10000000-0000-4000-8000-000000000002',repeat('a',64))
  from fixtures where label='A'$$,'Envía canción durante un sorteo');
select lives_ok($$select submit_public_song_request(code,'Tema 3','Artista','10000000-0000-4000-8000-000000000003',repeat('a',64))
  from fixtures where label='A'$$,'Segundo recibo desde la misma red');
select lives_ok($$select submit_public_song_request(code,'Tema B','Artista','10000000-0000-4000-8000-000000000004',repeat('a',64))
  from fixtures where label='B'$$,'Recibo de otro evento');
select is(lookup_public_raffle((select code from fixtures where label='A'),'10000000-0000-4000-8000-000000000002',repeat('b',64)),
  'null'::jsonb,'El recibo no sirve desde un origen diferente');
select is((lookup_public_raffle((select code from fixtures where label='A'),'10000000-0000-4000-8000-000000000002',repeat('a',64)))->>'prize_name',
  'Premio final','Devuelve una invitación válida');

create function pg_temp.enter_a(receipt uuid, browser uuid, accepted boolean, version int) returns jsonb
language sql as $$
  select enter_public_raffle((select code from fixtures where label='A'),receipt,repeat('a',64),browser,'  Luna  ',accepted,version)
$$;
select throws_ok($$select pg_temp.enter_a('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',false,2)$$,
  'PT400','INVALID_ENTRY','Sin aceptación explícita no inscribe');
select throws_ok($$select pg_temp.enter_a('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',true,1)$$,
  'PT409','RAFFLE_TERMS_CHANGED','No acepta una versión incorrecta');
select throws_ok($$select pg_temp.enter_a('10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001',true,2)$$,
  'PT404','RAFFLE_NOT_AVAILABLE','No reutiliza recibo de otro evento');

set local role authenticated;
select is((select count(id) from raffle_entries),0::bigint,'Los envíos de canciones no inscriben a nadie');
set local role service_role;
select is(pg_temp.enter_a('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',true,2),
  '{"status":"ENTERED"}'::jsonb,'Alta voluntaria');
select is(pg_temp.enter_a('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',true,2),
  '{"status":"ALREADY_ENTERED"}'::jsonb,'Deduplica el mismo recibo');
select is(pg_temp.enter_a('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001',true,2),
  '{"status":"ALREADY_ENTERED"}'::jsonb,'Deduplica el mismo navegador con otro recibo');
select is(pg_temp.enter_a('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002',true,2),
  '{"status":"ENTERED"}'::jsonb,'Permite otro invitado en la misma Wi-Fi');

set local role anon;
select throws_ok($$select id from raffle_entries$$,'42501',null,'El invitado no lista participantes');
select throws_ok($$select lookup_public_raffle(null,null,null)$$,'42501',null,'El invitado no invoca RPC privilegiada directamente');
set local role authenticated;
select throws_ok($$select browser_hash from raffle_entries$$,'42501',null,'Ni el propietario puede ver las claves antidupli­cado');
select throws_ok($$delete from raffle_entries$$,'42501',null,'El propietario no altera la lista de elegibles');
select is((select count(id) from raffle_entries),2::bigint,'Participaciones voluntarias únicas');
select lives_ok($$select close_event(event_id) from fixtures where label='A'$$,'Cerrar evento mantiene su comportamiento');

set local role service_role;
select is(lookup_public_raffle((select code from fixtures where label='A'),'10000000-0000-4000-8000-000000000002',repeat('a',64)),
  'null'::jsonb,'Evento cerrado deja de ofrecer el sorteo');
select is(pg_temp.enter_a('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',true,2),
  '{"status":"ALREADY_ENTERED"}'::jsonb,'Un reintento inscrito se confirma incluso después del cierre');

set local role authenticated;
create temporary table draw_copy as select d.* from draw_raffle((select event_id from fixtures where label='A')) d;
select results_eq($$select * from draw_raffle((select event_id from fixtures where label='A'))$$,$$select * from draw_copy$$,
  'El sorteo es idempotente');
select is((select eligible_count from draw_copy),2::bigint,'Registra población elegible');
select is((select winner_name from draw_copy),'Luna','Registra el apodo normalizado');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
select is((select count(*) from raffles),0::bigint,'Otro DJ no lee sorteos');
select is((select count(id) from raffle_entries),0::bigint,'Otro DJ no lee participantes');
select is((select count(*) from raffle_draws),0::bigint,'Otro DJ no lee resultados');
select throws_ok($$select draw_raffle(event_id) from fixtures where label='A'$$,'PT404','RAFFLE_NOT_FOUND','Otro DJ no sortea');
select throws_ok($$select close_raffle(event_id) from fixtures where label='A'$$,'PT404','RAFFLE_NOT_FOUND','Otro DJ no cierra inscripciones');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select lives_ok($$select delete_event(event_id) from fixtures where label='A'$$,'Borrar el evento conserva el flujo de borrado');
select lives_ok($$select save_raffle(event_id,'Premio B','','Bases',now()+interval '1 hour')
  from fixtures where label='B'$$,'Puede configurarse otro sorteo en otro evento');
select lives_ok($$select activate_raffle(event_id) from fixtures where label='B'$$,'Activa el segundo sorteo');
set local role service_role;
select lives_ok($$select submit_public_song_request(code,'Tema B 2','Artista','10000000-0000-4000-8000-000000000005',repeat('a',64))
  from fixtures where label='B'$$,'Crea recibo válido para el segundo sorteo');
reset role;
update raffles set closes_at = clock_timestamp() - interval '1 second' where event_id = (select event_id from fixtures where label='B');
set local role service_role;
select is(lookup_public_raffle((select code from fixtures where label='B'),'10000000-0000-4000-8000-000000000005',repeat('a',64)),
  'null'::jsonb,'No ofrece inscripciones después del plazo');
select throws_ok($$select enter_public_raffle(code,'10000000-0000-4000-8000-000000000005',repeat('a',64),
  '20000000-0000-4000-8000-000000000003','Otro',true,1) from fixtures where label='B'$$,
  'PT409','RAFFLE_CLOSED','El servidor rechaza inscripciones hasta con recibo válido si venció el plazo');
set local role authenticated;
select throws_ok($$select draw_raffle(event_id) from fixtures where label='B'$$,'PT409','RAFFLE_EMPTY','Sin participantes no genera un ganador');
select lives_ok($$select delete_event(event_id) from fixtures where label='B'$$,'Limpia segundo sorteo desechable');
reset role;
select is((select count(*) from raffles),0::bigint,'El borrado elimina el sorteo');
select is((select count(*) from raffle_entries),0::bigint,'El borrado elimina las participaciones');
select is((select count(*) from raffle_draws),0::bigint,'El borrado elimina el resultado');
select ok(bool_and(i >= 0 and i < 13), 'La selección criptográfica se mantiene en rango')
  from (select private.raffle_random_index(13) as i from generate_series(1,128)) t;
select * from finish();
rollback;
