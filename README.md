# PideBeat

**Pide tu canción. Vive el ritmo.** Aplicación web de solicitudes musicales por QR para DJs e invitados, sin instalación ni cuenta para el invitado.

El objetivo del MVP 1.0 es: DJ crea evento, comparte QR, invitado solicita canción y artista, y DJ recibe el pedido en tiempo real. Una única plataforma sirve a múltiples DJs con datos aislados por workspace. No incluye pagos, suscripciones cobradas, pantallas premium, votaciones, estrellas, Spotify, chat ni aplicaciones nativas.

## Estado Real

Este documento describe el código revisado y los resultados previamente reportados en [supabase/BACKEND.md](supabase/BACKEND.md). No certifica un despliegue ni una aceptación completa del MVP.

| Fase | Implementado en el repositorio | Límites y pendientes |
| --- | --- | --- |
| A: preparación | Entrada React, enrutador, rutas protegidas, estilos responsive, marca centralizada, layout, ESLint y configuración Vitest con setup de Testing Library | Lint, build y 116 pruebas frontend aprobadas; revisión en Chrome desktop y móvil emulado. Accesibilidad completa y dispositivos físicos pendientes. |
| B: datos y autenticación | Migración multi-tenant, RLS, aprovisionamiento personal idempotente, sesión, login/registro protegido opcional y cierre de sesión; dashboard con listado, creación y detalle/cierre de eventos mediante RPC | Auth remoto, SMTP, confirmación de correo y aislamiento con sesiones reales pendientes de aceptación. |
| C: QR y envío público | QR con `qrcode.react`, copia de enlace y descarga SVG; formulario público sin cuenta, validación, confirmación tras respuesta del servidor y reintentos idempotentes; Edge Functions con persistencia atómica y cuotas SQL | Flujo completo, escaneo físico y cabecera confiable del gateway pendientes de verificar en el entorno desplegado. |
| D: bandeja y Realtime | Bandeja con estados, carga paginada, orden reciente primero, suscripción INSERT/UPDATE por evento, fusión por ID, resincronización, estado de conexión y actualización manual | Entrega real, aislamiento Realtime entre DJs y recuperación tras desconexión pendientes de verificar contra Supabase. |
| E: calidad y publicación | Suites frontend, SQL, concurrencia y Edge, documentación backend y configuración SPA para Vercel | Resultados detallados más abajo. No se afirman despliegues ni pruebas desde celulares. |

Las rutas implementadas son `/`, `/dj/login`, `/dj/dashboard`, `/dj/event/:id`, `/e/:publicCode` y una página para rutas desconocidas. Dashboard y detalle de evento requieren sesión; la página de invitado tiene una presentación independiente, sin navegación privada. Sin configuración pública de Supabase, la aplicación muestra instrucciones de conexión en lugar de datos simulados.

### Funcionalidades Frontend

- **DJ:** inicio/cierre de sesión y registro opcional con Turnstile; aprovisionamiento del workspace personal al cargar el dashboard, listado paginado de eventos, creación, detalle y cierre con confirmación.
- **QR:** visualización del código, enlace seleccionable, copia al portapapeles y descarga en SVG para impresión o proyección, con validación de URL HTTPS fuera del desarrollo local permitido.
- **Invitado:** consulta pública del nombre y disponibilidad, canción y artista obligatorios, bloqueo de doble envío, mensajes específicos de error y confirmación únicamente después de recibir `ok: true`. Permite pedir otra canción, sujeto a las cuotas del backend.
- **Reintentos:** mantiene UUID y contenido en memoria ante un resultado ambiguo de red/503, bloqueando la edición del pedido pendiente. No conserva ese estado tras recargar o abandonar la página.
- **Bandeja:** título, artista, fecha local y selector `PENDIENTE`/`ATENDIDA`/`RECHAZADA`; fusión por ID y orden por fecha reciente. Solo se envían cambios de estado al servidor.
- **Realtime:** suscripción por evento con el cliente de sesión DJ, consulta inicial y nueva consulta al suscribirse/reconectar, recuperar la red o volver a la pestaña. El canal se elimina al desmontar; hay estado de conectividad y botón **Actualizar lista**.
- **Interfaz:** estilos desde 360 px, foco visible, controles etiquetados y mensajes con roles de estado/alerta. Portada, login y formulario comprobados en Chrome a 1366 y 360 px sin desbordamiento horizontal; queda pendiente una auditoría completa de accesibilidad y dispositivos físicos.

Las pruebas automatizadas no sustituyen la validación de extremo a extremo con Supabase y dispositivos reales.

## Arquitectura

- **Web:** React + Vite + TypeScript, Tailwind y React Router, una sola aplicación responsive para DJ e invitado.
- **Identidad:** Supabase Auth por correo y contraseña. La sesión del DJ determina los permisos; nunca se confía en un workspace elegido libremente por el navegador.
- **Datos:** PostgreSQL con `workspaces`, `workspace_members`, `events` y `song_requests`. RLS permite lecturas por membresía y mutaciones del propietario; `admin/staff` son de solo lectura en este MVP, sin UI de equipos.
- **Operaciones privadas:** RPC `ensure_personal_workspace`, `create_event` y `close_event`. El aprovisionamiento es transaccional e idempotente. El código público lo genera el servidor con 128 bits criptográficos, separado de los UUID privados.
- **Invitados:** `get-public-event` expone solo nombre y disponibilidad. `submit-song-request` valida y registra mediante una operación SQL atómica; no hay inserción anónima directa en tablas.
- **Tiempo real:** la migración publica únicamente `public.song_requests` en `supabase_realtime`. El frontend escucha INSERT/UPDATE con el cliente de sesión DJ y filtro por evento; RLS determina qué filas puede recibir. La validación real de entrega y aislamiento sigue pendiente.
- **Hosting previsto:** frontend en Vercel y backend en un proyecto Supabase compartido por los DJs, no un proyecto por cliente.

### Ubicaciones

| Ruta | Responsabilidad |
| --- | --- |
| `AGENTS.md` | Alcance, requisitos y criterios de aceptación |
| `src/main.tsx` y `src/app/App.tsx` | Arranque, proveedor de sesión, rutas, protección privada, portada y página no encontrada |
| `src/styles/index.css` | Tailwind, tema, estilos responsive y foco visible |
| `src/config/brand.ts` | Nombre, eslogan, colores y URL pública para eventos |
| `src/components/Layout.tsx` | Layout, mensajes, carga y cierre de sesión |
| `src/features/auth/` | Estado de sesión, login/registro y widget Turnstile |
| `src/features/events/` | Dashboard, creación, detalle/cierre de eventos y QR |
| `src/features/song-requests/` | Formulario público, bandeja, estados, suscripción Realtime y fusión de solicitudes |
| `src/lib/supabase.ts` | Cliente Supabase con clave pública |
| `src/lib/api.ts` | Llamadas Edge, errores públicos y lectura paginada de solicitudes |
| `src/lib/validation.ts` | Validación frontend de texto |
| `src/types/database.ts` | Tipos de datos y RPC |
| `src/test/setup.ts` | Setup de Testing Library y limpieza después de cada test Vitest |
| `supabase/migrations/` | Esquema, permisos, RLS, RPC y publicación Realtime |
| `supabase/functions/` | Edge Functions, utilidades y tests Deno |
| `supabase/tests/backend.test.sql` | Pruebas SQL/RLS pgTAP |
| `supabase/tools/` | Bootstrap PostgreSQL desechable y prueba de concurrencia |
| `supabase/BACKEND.md` | Contratos, seguridad y resultados backend detallados |
| `vercel.json` | Rewrite SPA y cabeceras del frontend |

## Editar y eliminar eventos

En **Mis eventos**, abre el menú **⋮** de la tarjeta. **Editar nombre** conserva el identificador, el QR, el estado y las solicitudes. El enlace publicado muestra el nombre nuevo al volver a cargarlo. **Eliminar evento** requiere confirmación y borra el evento y sus solicitudes; el QR deja de funcionar. Si quieres dejar de recibir solicitudes sin perder el historial, usa **Cerrar evento**.

Para habilitar estas opciones en una instalación existente, prueba primero la [migración de gestión de eventos](supabase/migrations/20261119000000_event_management.sql) en Supabase local o de pruebas. Antes de publicar el frontend, aplica **solo esa migración nueva**. Si la inicial se aplicó manualmente con el SQL Editor, usa el mismo método para este archivo; no vuelvas a ejecutar la inicial. El script no borra filas existentes al aplicarse. Mantiene Realtime para nuevas solicitudes y cambios de estado, y deja de publicar borrados para proteger el aislamiento. No requiere variables nuevas ni redesplegar las Edge Functions.

## Desarrollo

Requisitos: **Node.js 22.12.0 o superior** y npm. Para reproducir el entorno de despliegue, usar Node 22.x. Supabase CLI requiere acceso al proyecto remoto; Docker solo es necesario para el stack Supabase local. Las pruebas nativas necesitan PostgreSQL, `psql` y pgTAP.

Desde la raíz del proyecto:

```sh
node --version
npm --version
npm install
npm run dev
```

Vite escucha en `0.0.0.0`; normalmente se accede por `http://localhost:5173`. Esto no proporciona HTTPS. Para conectar los flujos reales, configurar las variables y el backend descritos más abajo.

Comandos disponibles para verificar el frontend:

```sh
npm run lint
npm run build
npm run test
```

Scripts revisados en el `package.json` actual: `dev` ejecuta `vite --host 0.0.0.0`, `lint` ejecuta `eslint .`, `build` ejecuta `tsc -b && vite build` y `test` ejecuta `vitest run`. También existen `npm run test:watch` (`vitest`) y `npm run preview` (`vite preview --host 0.0.0.0`), este último para servir un build generado previamente.

Verificación ejecutada con Node 22.23.3: **`npm run lint`, `npm run build` y `npm run test` aprobados**, con **116 tests en 5 archivos**. Cubren validaciones, errores Edge, confirmación de la respuesta, doble envío, reintentos y carreras/reconexión de Realtime con mocks. Estos mocks no certifican Auth, REST ni Realtime remotos. `npm ci` también completó una instalación limpia desde el lock y `npm audit --omit=dev` informó cero vulnerabilidades de producción.

Se realizaron además **18 comprobaciones satisfactorias en Chrome headless 153.0.8010.52**, con Playwright Core 1.65.1 temporal: portada, login/redirección privada y formulario público a 1366×900 y 360×800, ausencia de desbordamiento, espera de confirmación, estados 429/503/cerrado/inexistente y rechazo de `ok: false`. Las respuestas Edge se interceptaron con mocks: no es una prueba E2E de Supabase. Capturas, script y reporte quedaron fuera del repositorio en `/tmp/opencode/browser-check/`; son artefactos temporales del entorno de desarrollo, no un requisito de instalación.

Versiones instaladas: React/React DOM **19.3.1**, React Router **7.18.6**, Vite **8.3.8**, TypeScript **5.9.3**, Tailwind **4.3.5**, Vitest **4.1.12**, ESLint **9.39.5**, `qrcode.react` **4.2.0** y `@supabase/supabase-js` **2.118.0**. `package-lock.json` fija la resolución. El entorno original tenía Node 18; se usó temporalmente `npx --yes --package=node@22 -c 'npm run test'` sin reemplazar el Node del sistema. Para instalar se usó npm 11.21.3; npm 9 presentó un fallo interno de resolución. Se recomienda npm moderno y Node 22.

### Variables Del Frontend

Crear `.env.local` en la raíz tomando [.env.example](.env.example) como referencia:

```dotenv
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
VITE_PUBLIC_URL=http://localhost:5173
VITE_TURNSTILE_SITE_KEY=
```

- `VITE_SUPABASE_URL`: URL del proyecto remoto que contiene las migraciones y funciones.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: clave publicable del proyecto, nunca una clave privilegiada. Su seguridad depende de RLS y de los permisos del backend.
- `VITE_PUBLIC_URL`: origen público usado en los enlaces del QR. En producción debe ser HTTPS; el código solo permite HTTP para `localhost` o `127.0.0.1` en modo desarrollo. Una IP LAN con HTTP no sirve como URL compartible con este generador.
- `VITE_TURNSTILE_SITE_KEY`: sitekey pública opcional de Cloudflare Turnstile. Ver configuración Auth más abajo.

Todas las variables `VITE_*` se incorporan al navegador y **son públicas**. Nunca introducir `service_role`, claves secretas, contraseña de base de datos, secreto Turnstile ni `REQUEST_ORIGIN_SECRET` en ellas. No versionar `.env.local` ni archivos de secretos. Reiniciar Vite al cambiar variables; en Vercel, reconstruir el despliegue.

### Backend Local

Para desarrollo se recomienda **frontend local + backend Supabase remoto**. Añadir el origen local exacto a CORS y a las URLs Auth que correspondan.

El envío público utiliza exclusivamente `cf-connecting-ip` para identificar el origen. Sin esa cabecera válida, o sin el secreto requerido, devuelve **503 `UNAVAILABLE` sin ejecutar el RPC ni insertar datos**. No hay bypass local ni alternativa con `X-Forwarded-For`.

Un backend local o self-hosted requiere un **proxy confiable** que elimine/sobrescriba esa cabecera y bloquee el acceso directo al runtime. No exponer `functions serve` a Internet ni enviar `cf-connecting-ip` desde el frontend. Inyectarla en una prueba local permite probar lógica, pero no demuestra seguridad frente a suplantación. Antes de abrir el backend remoto al público, verificar también que el gateway gestionado entrega la cabecera y sobrescribe o rechaza valores falsificados por el cliente.

## Supabase Remoto

Crear un proyecto Supabase y obtener su referencia, URL y clave publicable. Los siguientes pasos son instrucciones de configuración, **no un despliegue ya realizado**. Revisar las migraciones antes de aplicarlas a un proyecto con datos.

Desde la raíz, establecer `PROJECT_REF` con la referencia real:

```sh
export PROJECT_REF="TU_REFERENCIA_DE_PROYECTO"
npx --yes supabase@2.58.5 login
npx --yes supabase@2.58.5 link --project-ref "$PROJECT_REF"
npx --yes supabase@2.58.5 db push
```

Configurar en Dashboard > Edge Functions > Secrets:

| Secreto | Configuración |
| --- | --- |
| `ALLOWED_ORIGINS` | Orígenes exactos separados por comas, sin barra final ni `*`; por ejemplo `http://localhost:5173,https://TU_DOMINIO` |
| `REQUEST_ORIGIN_SECRET` | Secreto aleatorio estable de al menos 32 bytes, generado con CSPRNG |

Por ejemplo, `openssl rand -hex 32` genera un valor aleatorio adecuado para el secreto. Guardarlo de forma privada, no en el frontend ni en el repositorio. También se pueden cargar ambos valores desde un archivo privado fuera del proyecto:

```sh
npx --yes supabase@2.58.5 secrets set --env-file /ruta/privada/pidebeat-edge.env
npx --yes supabase@2.58.5 functions deploy get-public-event
npx --yes supabase@2.58.5 functions deploy submit-song-request
```

El archivo privado debe contener `ALLOWED_ORIGINS` y `REQUEST_ORIGIN_SECRET` con sus valores reales. `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son variables privadas provisionadas por Supabase para Edge; no copiarlas al frontend.

`supabase/config.toml` declara `verify_jwt = false` para las dos funciones públicas. Esto admite invitados sin cuenta, no elimina las validaciones, cuotas ni permisos SQL. La migración configura Realtime para `song_requests`; verificar su publicación en el proyecto remoto y consumirlo con sesión DJ autenticada.

Sin whitelist válida las funciones fallan cerradas. Autorizar cada dominio de preview explícitamente, sin wildcard. CORS no es autenticación: clientes sin `Origin` pasan los mismos controles del servidor.

### Auth Y Registro

Configurar el proyecto **remoto** en Supabase Auth; los ajustes de `config.toml` corresponden al stack local y no sustituyen esta configuración:

1. Habilitar acceso por email/contraseña y confirmación de correo. Usar una política de contraseña de al menos 12 caracteres, coherente con el formulario de registro.
2. Definir **Site URL** como el origen HTTPS real del frontend. Añadir **Redirect URLs** exactas: `https://TU_DOMINIO/dj/login` y, si se desarrolla localmente, `http://localhost:5173/dj/login`. El formulario usa el origen actual del navegador más `/dj/login` para `emailRedirectTo`.
3. Configurar SMTP real y comprobar entrega, confirmación y redirección de correos. No asumir que el servicio de correo de desarrollo cubre producción.
4. Si no se usa Turnstile, dejar `VITE_TURNSTILE_SITE_KEY` vacía. **La UI no ofrece registro público**; el administrador crea las cuentas desde Supabase Auth mediante un procedimiento seguro. Deshabilitar además las altas públicas en Supabase si se desea impedir registros directos por API: ocultar la opción en la UI no es una barrera de servidor.
5. Para habilitar registro protegido, crear un widget Turnstile con los dominios autorizados, configurar el proveedor CAPTCHA y su **clave secreta en Supabase Auth**, habilitar las altas y establecer solo la **sitekey pública** en `VITE_TURNSTILE_SITE_KEY`. Mantener confirmación de email y límites antiabuso de Auth.
6. Comprobar el CAPTCHA tanto en registro como en login: el componente actual lo muestra en ambos modos cuando hay sitekey y envía `captchaToken` a Supabase. Añadir solo la sitekey sin configurar CAPTCHA en Supabase no garantiza protección.

Turnstile de Auth no protege automáticamente el envío de canciones por invitados. La defensa actual de ese endpoint son validación, cuotas e idempotencia del backend.

## Seguridad Y Límites

Canción y artista deben tener entre 2 y 120 puntos de código Unicode después de `trim`, sin caracteres de control. El endpoint rechaza campos adicionales como `status`, `event_id`, `workspace_id` o roles. Los invitados no pueden listar ni modificar solicitudes privadas.

Cada envío exige `request_id` UUID generado con `crypto.randomUUID()`. El formulario implementado conserva en memoria el mismo UUID y contenido en reintentos de red o 503: un éxito previo devuelve éxito sin duplicar. Reutilizarlo con otro texto u origen produce conflicto. La conservación no persiste tras una recarga; verificar los reintentos de extremo a extremo antes de publicar.

Las cuotas son antispam, no límites comerciales: **3 envíos exitosos por evento/origen y 120 exitosos por evento en una ventana deslizante de 60 segundos**. Conteo e inserción bloquean la misma fila de evento que el cierre, evitando carreras. Los reintentos idempotentes de éxitos previos no consumen otra cuota y pueden confirmar el éxito incluso después del cierre.

| HTTP | Caso principal |
| --- | --- |
| 200 | Lectura pública o envío confirmado por el servidor |
| 400 | Entrada, método u origen no permitido |
| 404 | Evento inexistente |
| 409 | Evento cerrado o conflicto de idempotencia |
| 429 | Cuota agotada; `Retry-After: 60` |
| 503 | Indisponibilidad, configuración incorrecta o IP confiable ausente/inválida |

Los dispositivos bajo NAT/WiFi compartido comparten cuota de origen, por lo que pueden bloquearse invitados legítimos. Un cambio de red puede impedir reconocer un reintento como del mismo origen. IPv6 rotatoria, VPN y botnets pueden eludir el límite individual; el límite agregado no evita ataques de coste o agotamiento deliberado de la cuota del evento. Evaluar protección de gateway o CAPTCHA verificado en servidor si aparece abuso real.

El origen se guarda como HMAC por evento, no como IP cruda. Rotar `REQUEST_ORIGIN_SECRET` cambia las cuotas y puede invalidar reintentos anteriores: hacerlo de forma planificada. El HMAC es seudónimo, no garantía legal de anonimato. No hay purga automática; definir retención operativa sin borrar recibos de eventos activos, necesarios para idempotencia. Ver [BACKEND.md](supabase/BACKEND.md) para el contrato completo.

## Vercel

La publicación del frontend está pendiente: requiere disponer de credenciales y configurar el proyecto remoto, Auth, secretos y dominios. La apertura pública de envíos queda además condicionada a comprobar la cabecera `cf-connecting-ip` y su protección contra suplantación en el gateway.

1. Importar el proyecto en Vercel, con preset **Vite**, raíz del proyecto, instalación `npm install`, build `npm run build` y salida `dist`.
2. Seleccionar **Node.js 22.x** en la configuración del proyecto, respetando el mínimo 22.12.0 de `package.json`.
3. Definir `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_PUBLIC_URL` con el origen HTTPS definitivo y, si corresponde, `VITE_TURNSTILE_SITE_KEY`. No configurar secretos backend como variables `VITE_*`.
4. Mantener el rewrite existente en `vercel.json`, `/(.*)` hacia `/index.html`, para resolver accesos directos y recargas de las rutas implementadas en React Router.
5. Añadir el origen HTTPS a `ALLOWED_ORIGINS`, el callback `/dj/login` a Auth y el dominio a Turnstile cuando se use. Repetir la configuración explícita para cada preview autorizado.
6. Reconstruir y comprobar acceso directo, recarga de rutas privadas/públicas, confirmación de correo y QR con URL HTTPS real. No usar `localhost` en QR destinados a celulares.

## Verificaciones Backend

Según los resultados **ya reportados en `supabase/BACKEND.md`**, no ejecutados de nuevo para este README:

- Migración aplicada sin errores en PostgreSQL nativo 16.10, con pgTAP 1.3.4.
- 66 aserciones pgTAP aprobadas, también verificadas con parser TAP.
- Un test de concurrencia real aprobado: ocho conexiones para aprovisionamiento, ocho reintentos, ráfagas sobre ambas cuotas y ambos órdenes de cierre/envío.
- Cinco tests Edge aprobados; `task check`, `lint` y `fmt --check` aprobados con Deno 2.9.6. Los tests Edge simulan respuestas RPC; la persistencia se comprueba en PostgreSQL, no en esos mocks.
- CLI oficial 2.58.5 aceptó la configuración, pero no completó `status` por falta de daemon Docker. El wrapper npm no completó su arranque en ese entorno; se usó el binario oficial para esa comprobación.
- No se ejecutaron stack Supabase completo ni `db lint`. No se configuró ni desplegó proyecto remoto.

El stack local declara PostgreSQL 17, aunque las pruebas nativas reportadas usaron 16.10. No confundir esas pruebas con GoTrue/Auth, PostgREST, gateway o Realtime funcionando de extremo a extremo.

### Comandos Reproducibles

Desde la raíz, con Docker disponible:

```sh
npx --yes supabase@2.58.5 start
npx --yes supabase@2.58.5 db reset
npx --yes supabase@2.58.5 test db
npx --yes supabase@2.58.5 db lint --local --level warning
```

`db reset` reconstruye la base **local** y elimina sus datos. No usar procedimientos de prueba sobre producción.

Sin Docker, preparar una base **desechable** PostgreSQL 16 con pgcrypto y pgTAP, y definir `TEST_DATABASE_URL` apuntando exclusivamente a ella:

```sh
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tools/native-bootstrap.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261118000000_backend.sql
psql "$TEST_DATABASE_URL" -XqAt -v ON_ERROR_STOP=1 -f supabase/tests/backend.test.sql
npx --yes deno@2.9.6 test --allow-env=TEST_DATABASE_URL --allow-run=psql supabase/tools/concurrency_test.ts
```

El bootstrap crea sustitutos mínimos de `auth.users`, `auth.uid()` y roles: **nunca ejecutarlo en un Supabase existente**. La suite SQL hace rollback; concurrencia necesita superusuario de pruebas para fixtures/roles y limpia sus datos. Si falta pgTAP, consultar en `BACKEND.md` la carga de pgTAP 1.3.4 en `extensions`.

`psql` no devuelve error por una aserción pgTAP `not ok`. En CI usar `supabase test db` o un parser TAP. Con `prove` disponible, después de preparar la base desechable, se puede comprobar el TAP con:

```sh
prove --exec "psql $TEST_DATABASE_URL -XqAt -v ON_ERROR_STOP=1 -f" supabase/tests/backend.test.sql
```

No publicar cadenas de conexión ni logs con credenciales. El comando histórico de `BACKEND.md` usó un socket local específico; no es un requisito de estas pruebas.

Desde el directorio `supabase/functions`, ejecutar:

```sh
npx --yes deno@2.9.6 task check
npx --yes deno@2.9.6 task test
npx --yes deno@2.9.6 lint
npx --yes deno@2.9.6 fmt --check
```

Las dependencias Deno están fijadas en `supabase/functions/deno.lock`, con `supabase-js` 2.118.0. Estas verificaciones no reemplazan la aceptación del despliegue completo.

## Aceptación Pendiente

Realizar este protocolo **después de verificar el frontend y configurar el backend remoto con las credenciales necesarias**. No se ha ejecutado desde dos dispositivos ni se da por aprobado. El stack Supabase local completo sigue sin verificarse por falta de daemon Docker, según el reporte backend; la alternativa de desarrollo es frontend local con backend remoto, sin omitir la comprobación del gateway.

1. Publicar el frontend por HTTPS, verificar sus variables, CORS y URLs Auth. Confirmar entrega SMTP y comportamiento de Turnstile si está habilitado. Verificar la cabecera del gateway y su resistencia a suplantación antes de abrir envíos públicos.
2. Crear dos cuentas distintas, DJ A y DJ B, confirmadas. Si no hay sitekey, crearlas administrativamente. Comprobar que cada una obtiene un workspace personal independiente y membresía `owner`.
3. En el primer celular, iniciar sesión como DJ A, crear un evento y abrir su QR. Comprobar que enlace, copia y descarga contienen el origen HTTPS real, sin credenciales ni UUID privados de workspace.
4. En el segundo celular, idealmente alternando Android/iPhone, escanear el QR sin sesión ni instalación. Enviar canción y artista; aceptar la confirmación solo tras respuesta exitosa y comprobar la fila real en backend.
5. Verificar llegada a la bandeja de A sin recarga y sin duplicados. Probar cambios a `ATENDIDA` y `RECHAZADA`, desconexión/reconexión con recuperación de pedidos y actualización manual.
6. Reintentar un envío ambiguo con el mismo `request_id`, contenido y red: debe haber una sola fila. Reutilizar el UUID con otro contenido debe dar 409. Un pedido nuevo tras cerrar el evento debe dar 409 `EVENT_CLOSED`, incluso con el formulario previamente abierto.
7. En otra sesión o perfil limpio, iniciar como DJ B. Intentar abrir la URL privada de A y consultar/modificar sus eventos y solicitudes por REST usando los JWT reales de B y UUID conocidos. Verificar también por separado que una suscripción Realtime de B no recibe pedidos de A. No basta con ocultar enlaces en la UI.
8. Con acceso anónimo, comprobar denegación de lectura/escritura directa de solicitudes, eventos privados y miembros. Con DJ B, comprobar que no puede asignarse al workspace de A ni elevar roles.
9. En otro evento activo, probar la cuarta solicitud nueva desde el mismo origen dentro de 60 segundos: debe responder 429. Verificar la cuota agregada de 120/minuto mediante pruebas controladas, no una ráfaga manual en producción. Repetir WiFi compartido y red móvil para observar el efecto NAT.
10. Comprobar errores de red, evento inexistente/cerrado, doble clic, navegación por teclado, foco, mensajes accesibles y diseño a partir de 360 px. Ejecutar y registrar `npm run lint`, `npm run build` y `npm run test` antes de declarar el frontend verificado.

Siguen pendientes la aceptación REST con JWT reales, Realtime cruzado/reconexión, Auth/SMTP, gateway y anti-spoofing, despliegues Edge/Vercel y pruebas físicas. La arquitectura permite evolución multi-tenant sin implementar en esta entrega cobros ni funcionalidades comerciales fuera del MVP.
