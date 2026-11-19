# Backend PideBeat MVP

Solo Supabase: Auth, PostgreSQL con RLS, Edge Functions y publicacion Realtime.
No hay pagos, suscripciones, planes ni datos simulados de produccion.

## Contrato privado

Usar sesion Supabase Auth de email/contrasena confirmada, rol `authenticated`.

| Operacion | Argumentos RPC | Resultado |
| --- | --- | --- |
| `ensure_personal_workspace` | `{}` | UUID escalar del workspace personal |
| `create_event` | `{ "p_name": "Mi evento" }` | Fila compuesta `events`; PostgREST puede representarla como objeto o array |
| `close_event` | `{ "p_event_id": "UUID" }` | `void`, sin datos utiles; cierre idempotente |

`events`: `id uuid`, `workspace_id uuid`, `name text`, `public_code text`,
`is_active boolean`, `created_at timestamptz`, `closed_at timestamptz | null`.
El nombre se recorta, debe tener 1-120 caracteres y no contener controles.
Codigo generado exclusivamente en servidor: 16 bytes criptograficos, 32 hex
minusculas, 128 bits. No es el UUID interno del evento ni del workspace.

`song_requests`: `id uuid`, `event_id uuid`, `song_title text`, `artist text`,
`status text`, `created_at timestamptz`. Estados: `PENDIENTE`, `ATENDIDA`,
`RECHAZADA`. Solo hay permiso `UPDATE(status)`, sujeto a RLS de propietario.
Ningun cliente puede modificar `event_id`, texto, IDs, roles ni workspaces.

Seleccionar eventos por `workspace_id`; solicitudes por `event_id` con orden
`created_at DESC`, paginando si se superan las 1000 filas del Data API local.
La membresia valida autoriza lecturas; solo `owner` autoriza mutaciones.
Crear evento aprovisiona tambien el workspace si falta. No acepta un workspace
arbitrario; el mapa personal y la membresia se crean atomicamente, con bloqueo
por usuario. La politica de miembros solo consulta `auth.uid()`, sin recursion.

Errores privados: `42501` sin autorizacion; `PT400/INVALID_INPUT` para nombre
invalido; `PT404/EVENT_NOT_FOUND` al cerrar UUID inexistente o no autorizado.
No se diferencia existencia ajena. Los roles `admin/staff` solo tienen lectura
en este MVP; no hay API publica de gestion de miembros.

## Contrato publico

`POST /functions/v1/get-public-event`, `Content-Type: application/json`:

```json
{ "public_code": "32-caracteres-hex-minusculas" }
```

HTTP 200: exactamente `{ "name": "Mi evento", "is_active": true }`.

`POST /functions/v1/submit-song-request`:

```json
{
  "public_code": "32-caracteres-hex-minusculas",
  "song_title": "Cancion",
  "artist": "Artista",
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

HTTP 200: exactamente `{ "ok": true }`, solamente tras confirmar la transaccion.
Los ejemplos de codigo son marcadores, no codigos existentes validos.
`request_id` es obligatorio: generar con `crypto.randomUUID()` por nueva peticion,
conservarlo junto con el contenido en reintentos de red o `503`. Nunca generar
uno nuevo automaticamente para reintentar un resultado ambiguo.
Se rechazan campos extra, incluidos `status`, `event_id`, `workspace_id` y hashes.
Cancion/artista: 2-120 puntos de codigo Unicode tras `trim`, sin controles.
No se interpreta HTML; el frontend debe representar los campos como texto.

Todos los errores del handler tienen exactamente `{ "error": string, "code": string }`:

| HTTP | `code` | Significado |
| --- | --- | --- |
| 400 | `INVALID_INPUT` | JSON, tipo, longitud, UUID, codigo, campos o cuerpo invalidos |
| 400 | `ORIGIN_NOT_ALLOWED` | Origin no incluido en whitelist |
| 400 | `METHOD_NOT_ALLOWED` | Metodo distinto de POST/OPTIONS |
| 404 | `EVENT_NOT_FOUND` | Codigo valido pero inexistente |
| 409 | `EVENT_CLOSED` | Nuevo pedido a evento cerrado |
| 409 | `IDEMPOTENCY_CONFLICT` | UUID reutilizado con otro texto u origen |
| 429 | `RATE_LIMITED` | Cuota por origen o agregada agotada; `Retry-After: 60` |
| 503 | `UNAVAILABLE` | Configuracion, IP ausente/invalida, red, timeout o error interno |

`OPTIONS` permitido devuelve 204 sin cuerpo. Respuestas no cacheables.
Solo `service_role` tiene EXECUTE de `lookup_public_event(text)` y
`submit_public_song_request(text,text,text,uuid,text)`; anon y authenticated no.
Las Edge Functions crean su propio cliente privilegiado, sin propagar el JWT
ni el apikey recibido. Todas las SECURITY DEFINER fijan `search_path = ''` y
usan nombres cualificados. El helper de trim es SECURITY INVOKER e inmutable;
authenticated solo puede ejecutarlo para los CHECK, sin leer tablas privadas.

## Antispam y confianza

- Ventana deslizante de 60 segundos: hasta 3 exitos por evento/origen y 120
  exitos agregados por evento. No son limites de planes comerciales.
- Recibos privados persistentes e indices por fecha; ninguna memoria de proceso,
  localStorage ni Redis. Contar e insertar ocurre bajo `FOR UPDATE` del evento.
- `close_event` bloquea la misma fila: si el cierre gana, no entra el pedido;
  si el pedido gana, termina antes del cierre. Fecha calculada despues del lock.
- La clave de idempotencia es `(event_id, request_id)`. Un exito previo con igual
  texto normalizado y origen devuelve exito antes de revisar cuota o cierre.
  Conflictos no consumen cuota. No se persisten intentos rechazados.
- Solo se toma `cf-connecting-ip`, IP literal unica sin puerto/listas. No se
  aceptan alternativas `X-Forwarded-For`, IP del body ni identificadores elegidos
  por visitantes. Se normaliza IPv6 y se unifica IPv4 mapeada.
- HMAC-SHA-256 con `REQUEST_ORIGIN_SECRET` de al menos 32 bytes, mensaje
  `pidebeat:v1:<public_code>:<IP canonica>`. El alcance por evento evita enlazar
  un mismo origen entre eventos mediante los hashes almacenados.
- Ausencia de cabecera confiable o secreto invalido: **503, sin RPC ni INSERT**.
  No hay modo permisivo ni bypass local. Un secreto nuevo cambia cuotas y
  provoca conflicto en reintentos antiguos: rotarlo de forma planificada.
- No se almacenan IP cruda, user-agent, email, nombre ni datos de dispositivo
  del invitado; tampoco se registran cuerpos ni errores internos desde el codigo.
  Un HMAC es un identificador seudonimo, no una garantia legal de anonimato.
  Auth mantiene los datos necesarios del DJ. Invitados pueden escribir datos
  personales en texto libre; no es posible garantizar que nunca lo hagan.

Fuente oficial sobre la cabecera que establece Supabase Platform:
https://supabase.com/docs/guides/api/query-plans#production-use-with-pre-request-protection
La documentacion describe el gateway de plataforma; no prueba por si sola el
camino completo hasta tu Edge desplegada. **Antes de abrir al publico**, verificar
que tu endpoint recibe la cabecera y que valores falsos enviados desde fuera se
sobrescriben o rechazan. El codigo no puede autenticar criptograficamente una
cabecera aislada. Solo desplegar tras el gateway gestionado de Supabase; en
self-hosting/local, un proxy de confianza debe eliminar/sobrescribir la cabecera
y bloquear acceso directo al runtime. No exponer `functions serve` a Internet.
Sin ese proxy, las pruebas locales pueden inyectar cabeceras pero no demuestran
seguridad de origen. No enviar `cf-connecting-ip` desde el frontend.

Limitaciones: NAT/WiFi del local comparten cuota y pueden limitar invitados
legitimos; cambio de red impide reconocer un reintento por su origen. IPv6
rotatoria, VPNs y botnets evaden cuota individual; el limite agregado reduce
inserciones, no evita ataques de coste ni agotamiento deliberado del evento.
CORS no autentica bots: clientes sin Origin se admiten y pasan los mismos
controles. Para ataques reales agregar proteccion de gateway/CAPTCHA verificado
en servidor. El lookup publico es de solo lectura y no tiene cuota SQL de envios.
Los recibos duran tanto como el evento/solicitud para preservar idempotencia;
al borrar el evento en tareas administrativas se eliminan en cascada. Definir
retencion operativa antes de acumular eventos indefinidamente; no borrar recibos
de eventos activos para liberar cuota. No hay cron ni purga automatica oculta.

## Configuracion y despliegue

Versiones usadas para desarrollo: Deno 2.9.6, supabase-js 2.118.0 (npm exacto),
PostgreSQL 16.10 para pruebas nativas, pgTAP 1.3.4. `config.toml` usa PostgreSQL
17, version de stack soportada por CLI (16 no es una opcion de imagen local).
Dependencias de pruebas Deno fijadas tambien en `deno.lock`; el import npm
versionado es directo para que ambas Edge se desplieguen sin alias globales.
CLI recomendado para estos comandos: `npx --yes supabase@2.58.5` (Node >=20).
No se necesita modificar package.json ni instalar nada en el frontend.

Variables privadas de Edge:

| Variable | Valor |
| --- | --- |
| `SUPABASE_URL` | Provisionada por Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Provisionada por Supabase, nunca `VITE_*` |
| `ALLOWED_ORIGINS` | Origenes exactos separados por comas, sin barra final ni `*` |
| `REQUEST_ORIGIN_SECRET` | Secreto aleatorio estable; generar al menos 32 bytes con CSPRNG |

Configurar los dos secretos personalizados en Dashboard > Edge Functions >
Secrets, o con `supabase secrets set --env-file <ruta-privada>` fuera del repo.
Ejemplo de whitelist de desarrollo: `http://localhost:5173`.
Produccion: origen HTTPS real de Vercel/dominio propio. No usar wildcard para
previews; incluir cada origen aprobado. La app falla cerrada sin whitelist.

Desde la raiz:

```sh
npx --yes supabase@2.58.5 login
npx --yes supabase@2.58.5 link --project-ref "$PROJECT_REF"
npx --yes supabase@2.58.5 db push
npx --yes supabase@2.58.5 functions deploy get-public-event
npx --yes supabase@2.58.5 functions deploy submit-song-request
```

`verify_jwt = false` permite invitados sin cuenta. No elimina validaciones,
cuotas ni controles de base de datos. `config.toml` configura el stack local;
revisar tambien Auth alojado: URL HTTPS, redirect exacto `/dj/login`, confirmacion
email, SMTP real y proteccion antiabuso de registro (CAPTCHA/rate limits).
No se ha configurado ni desplegado ningun proyecto remoto.

## Verificaciones

Con Docker disponible:

```sh
npx --yes supabase@2.58.5 start
npx --yes supabase@2.58.5 db reset
npx --yes supabase@2.58.5 test db
npx --yes supabase@2.58.5 db lint --local --level warning
```

Sin Docker, usar base **desechable** PostgreSQL 16 con pgcrypto y pgTAP:

```sh
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tools/native-bootstrap.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261118000000_backend.sql
psql "$TEST_DATABASE_URL" -XqAt -v ON_ERROR_STOP=1 -f supabase/tests/backend.test.sql
npx --yes deno@2.9.6 test --allow-env=TEST_DATABASE_URL --allow-run=psql supabase/tools/concurrency_test.ts
```

Bootstrap nativo solo crea sustitutos minimos de `auth.users`, `auth.uid()` y
roles: **no ejecutar en un Supabase existente**. No replica GoTrue, PostgREST,
gateway ni Realtime. Para PostgreSQL sin pgTAP instalado puede cargarse el SQL
oficial de pgTAP 1.3.4 en `extensions` antes de ejecutar los tests; la suite
detecta `extensions.plan(integer)`. Las pruebas SQL hacen rollback.
El test de concurrencia requiere superusuario de pruebas para fixtures/roles
y limpia sus datos; nunca apuntarlo a produccion. `psql` solo falla por errores
SQL, no por aserciones pgTAP: en CI usar `supabase test db`/`pg_prove` para que
`not ok` cause codigo de salida no cero.

Desde `supabase/functions`:

```sh
npx --yes deno@2.9.6 task check
npx --yes deno@2.9.6 task test
npx --yes deno@2.9.6 lint
npx --yes deno@2.9.6 fmt --check
```

Los tests Edge simulan respuestas RPC, no persistencia real. La persistencia,
RLS y cuotas se prueban en PostgreSQL. Verificar ademas el despliegue completo.

Resultado de esta implementacion:

- Migracion aplicada sin errores en PostgreSQL nativo 16.10.
- 66 aserciones pgTAP aprobadas, verificadas tambien con parser TAP:
  `prove --exec 'psql -XqAt -h /tmp/opencode -p 55439 -d postgres -v ON_ERROR_STOP=1 -f' supabase/tests/backend.test.sql`.
- Un test de concurrencia real aprobado: ocho conexiones para aprovisionamiento,
  ocho reintentos, rafagas sobre ambas cuotas y los dos ordenes cierre/envio.
- Cinco tests Edge aprobados; `task check`, `lint` y `fmt --check` aprobados.
- CLI 2.58.5 descargada y ejecutada directamente: `supabase status` acepta la
  configuracion y llega a inspeccionar contenedores. No puede completar porque
  no hay daemon Docker. No se ejecutaron stack Supabase completo ni `db lint`.
- El wrapper npm de CLI no completo su arranque en este entorno; se uso el
  binario oficial 2.58.5 para comprobar configuracion. No se modifico package.json.

## Realtime y aceptacion

La migracion publica solo `public.song_requests` en `supabase_realtime`.
Suscribir con JWT DJ y filtro `event_id=eq.<uuid>`, eventos INSERT y UPDATE.
RLS aplica tambien al consumidor Realtime. Usar consulta inicial, fusion por
`id`, nueva consulta al reconectar y refresco manual desde frontend. No hace
falta replica identity FULL porque no hay DELETE ni filtros sobre valores
anteriores. No se publican recibos privados ni hashes.

1. DJ A inicia sesion en un telefono, aprovisiona workspace y crea evento.
2. Invitado abre URL HTTPS `/e/<public_code>` en otro telefono sin sesion; envia
   cancion/artista y confirma 200. Verificar fila real y llegada en bandeja A.
3. Repetir mismo request_id/contenido: mismo exito, ninguna fila adicional.
4. DJ B con otra cuenta no puede seleccionar ni actualizar el evento/canciones
   de A con UUID conocido; verificar REST y suscripcion Realtime por separado.
5. DJ A cambia status y cierra evento; nuevo request_id recibe 409 EVENT_CLOSED.
6. Abrir otro evento y probar cuota por IP y agregada; si ambos telefonos estan
   en el mismo WiFi comparten origen. Probar tambien red movil.

Quedan necesariamente para entorno real: email/SMTP, cabecera del gateway y
anti-spoofing, REST con JWT emitidos por Auth, Realtime cruzado/reconexion,
despliegue Edge y pruebas desde los dos dispositivos.
