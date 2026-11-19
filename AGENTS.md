# AGENTS.md — PideBeat

> Instrucciones permanentes para OpenCode. Aplicación SaaS de solicitudes musicales por QR para DJs.
> **Versión objetivo: MVP 1.0.** Preparar la arquitectura para vender suscripciones en el futuro, **sin implementar pagos ni suscripciones cobradas en esta entrega**.

## 0. Identidad, misión y prioridades

- **Nombre del producto:** PideBeat.
- **Propuesta:** «Pide tu canción. Vive el ritmo» (eslogan provisional).
- **Marca del producto:** PideBeat debe funcionar para cualquier DJ; no incrustar «DJ-Dev» ni «SoundTechnology» en textos, URLs, logos o datos por defecto del producto. Pueden figurar únicamente como autor/desarrollador en créditos opcionales.
- **Clientes previstos:** DJs independientes, servicios de sonido y, posteriormente, locales o empresas de eventos.
- **Modelo futuro:** SaaS multiinquilino (multi-tenant) con planes Free / Pro / Business y suscripciones. Los planes son **propuestas**, no precios ni funcionalidades de pago ya contratadas.
- **Prioridad número uno:** entregar un flujo estable: **DJ crea evento → obtiene QR → invitado escanea y pide canción → DJ recibe la solicitud en tiempo real**.
- **Prioridad número dos:** aislamiento de datos entre DJs y medidas contra spam. No sacrificar seguridad para acelerar el desarrollo.
- **Prioridad número tres:** modelo de datos extensible, sin crear sistemas de cobro o capas innecesarias.

### Papel del agente OpenCode

Actúa como **ingeniero de software senior full stack y arquitecto SaaS**, con criterio de producto, seguridad y mantenibilidad.

- **Modo Plan:** analiza el repositorio, presenta arquitectura, decisiones, fases, riesgos y cambios propuestos. **No modifiques archivos**.
- **Modo Build:** implementa el código real por fases; revisa el resultado y ejecuta verificaciones disponibles. No te limites a describir el código.
- Antes de crear o modificar componentes, revisa lo que ya existe. Preserva funcionalidades y evita cambios incompatibles sin justificación.
- Si hay decisiones no especificadas, elige la solución más simple compatible con este documento, deja constancia y continúa.
- No afirmes haber probado, desplegado o configurado servicios externos si no lo has realizado.
- **Idioma:** documentación, mensajes de interfaz, validaciones y comentarios necesarios en español; identificadores de código en inglés técnico consistente.
- No sobreingenierizar: no microservicios, no DDD complejo, no Kafka, no Redis solo por anticipar un SaaS.

## 1. Stack tecnológico obligatorio

| Capa | Tecnología | Uso |
| --- | --- | --- |
| Web DJ e invitados | React + Vite + TypeScript estricto | Una sola aplicación web responsive |
| Estilos | Tailwind CSS | Mobile-first; buen contraste |
| Rutas | React Router | Panel privado y página pública |
| Autenticación DJ | Supabase Auth | Email y contraseña |
| Base de datos | Supabase PostgreSQL | Espacios de trabajo, eventos, solicitudes |
| Seguridad de datos | Supabase Row Level Security (RLS) | Separación entre DJs |
| Envío público seguro | Supabase Edge Functions + operación SQL atómica | Validaciones, antispam, persistencia |
| Tiempo real | Supabase Realtime | Nuevas solicitudes en el panel |
| QR | Librería mantenida para QR | Enlace HTTPS al evento |
| Hosting frontend | Vercel | Despliegue web |
| Pruebas | Vitest + React Testing Library + pruebas SQL/RLS | Calidad y seguridad |

**No construir en MVP:** Flutter, aplicaciones nativas Android/iOS, backend propio Java/Quarkus, pasarela de pago, suscripciones cobradas, facturas, Spotify, votaciones, calificación con estrellas, chat, dedicatorias, búsquedas musicales, publicidad ni notificaciones push.

Usa versiones estables y compatibles. Verifica las APIs actuales en documentación oficial al configurar Supabase, React Router, Tailwind o Vercel. No inventar métodos ni opciones.

## 2. Alcance funcional: ENTREGAR AHORA (MVP 1.0)

### 2.1 DJ autenticado

1. Registrarse o iniciar sesión por email y contraseña mediante Supabase Auth (si se habilita registro público, proteger el abuso y confirmar email de acuerdo con configuración).
2. En la primera entrada, crear o aprovisionar automáticamente un **workspace** personal propio (espacio de trabajo) y membresía `owner`, de forma idempotente y segura.
3. Crear un evento con nombre obligatorio; el backend genera un `public_code` aleatorio impredecible de **al menos 128 bits de entropía**.
4. Visualizar el evento y su QR, copiar la URL y descargar el QR para imprimir o proyectar.
5. Ver las canciones solicitadas del evento: título, artista, fecha, estado; ordenar por fecha reciente primero.
6. Recibir automáticamente nuevas solicitudes mediante Supabase Realtime sin recargar la página.
7. Cambiar estado de una solicitud: `PENDIENTE`, `ATENDIDA`, `RECHAZADA`.
8. Cerrar evento; dejar de aceptar solicitudes **desde el servidor**, incluso si alguien conserva el enlace.
9. Acceder únicamente a los datos de los workspaces donde tiene permiso. Para MVP, solo se ofrece UI de propietario de su workspace personal.
10. Cerrar sesión.

### 2.2 Invitado sin cuenta

1. Escanea el código QR con un Android o un iPhone.
2. Abre `/e/:publicCode` en el navegador. **Sin instalación ni registro.**
3. Ve **solo** el nombre del evento y si está disponible para solicitudes.
4. Ingresa dos campos obligatorios: canción y artista (2–120 caracteres cada uno después de `trim`).
5. Presiona **Solicitar canción**.
6. Visualiza «¡Solicitud enviada al DJ!» **únicamente si el servidor confirma el registro**.
7. Si el evento está cerrado, no existe, hay límite de solicitudes o falla la red, muestra un mensaje específico y comprensible.
8. Previene doble clic accidental, muestra estado de carga y permite pedir otra canción cuando el backend lo autorice.

### 2.3 Páginas y rutas

- `/` — portada mínima de PideBeat con explicación y acceso al DJ; no necesita marketing complejo.
- `/dj/login` — login/registro DJ.
- `/dj/dashboard` — eventos del workspace y opción de crear evento.
- `/dj/event/:id` — QR, estado y bandeja de solicitudes del evento (privada).
- `/e/:publicCode` — formulario público por QR.
- `*` — página no encontrada.

El panel DJ debe poder utilizarse tanto en laptop como en teléfono; **no exigir app nativa**.

## 3. Multi-tenant: preparación para venderlo a otros DJs

### 3.1 Principio innegociable

La aplicación es **una sola plataforma con muchas cuentas**, NO una instancia de Supabase/Vercel por cada DJ.

- Cada DJ tendrá su usuario en Supabase Auth.
- Cada DJ será dueño inicialmente de un `workspace` personal (negocio/cuenta) independiente.
- Cada `workspace` tendrá sus propios eventos, QR y solicitudes.
- En el futuro un workspace podrá tener varios usuarios/colaboradores y una suscripción; **la interfaz de gestión de equipos no pertenece al MVP**.
- **Todas las autorizaciones privadas se determinan en el servidor mediante usuario autenticado y membresía en el workspace; nunca mediante un `workspace_id` proporcionado sin validar desde el navegador.**
- No utilizar `dj_id` como única frontera de seguridad: la frontera comercial y de datos es `workspace_id`.
- El QR público identifica un evento concreto, no expone el identificador interno del workspace ni credenciales.

### 3.2 Estructura mínima para crecer sin complejidad prematura

Mantener `workspaces` y `workspace_members` desde el MVP. Las tablas `events` y `song_requests` deben relacionarse de modo que siempre pueda determinarse a qué workspace pertenecen.

**No crear todavía** tabla de cobros, procesadores de pago, facturas, cupones ni webhook de facturación. Incorporarlos mediante migraciones cuando se implemente la fase comercial. Ver apartado 12.

## 4. Esquema PostgreSQL y migraciones versionadas

Crear SQL reproducible en `supabase/migrations/`. Elegir nomenclatura `snake_case`. Diseño propuesto (ajustar tipos y constraints con razones documentadas):

### 4.1 `workspaces`

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `name TEXT NOT NULL` — nombre visible de la cuenta/negocio.
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- **No permitir que el cliente modifique privilegios ni el plan mediante un `UPDATE` genérico.** No añadir campos de facturación editables por el DJ en MVP.

### 4.2 `workspace_members`

- `workspace_id UUID NOT NULL REFERENCES workspaces(id)`
- `user_id UUID NOT NULL REFERENCES auth.users(id)`
- `role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'staff'))`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `PRIMARY KEY (workspace_id, user_id)`
- En el MVP, el usuario inicial es `owner` y no existe interfaz para añadir miembros.
- **No autorizar** que un cliente se asigne otro workspace o se eleve a `owner/admin` mediante escrituras directas.

### 4.3 `events`

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `workspace_id UUID NOT NULL REFERENCES workspaces(id)`
- `name TEXT NOT NULL` (con restricciones de longitud y no vacío).
- `public_code TEXT NOT NULL UNIQUE` generado **en el servidor** mediante fuente criptográficamente segura de mínimo 128 bits.
- `is_active BOOLEAN NOT NULL DEFAULT true`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `closed_at TIMESTAMPTZ NULL`
- Indizar `workspace_id` y `public_code` (único).

### 4.4 `song_requests`

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `event_id UUID NOT NULL REFERENCES events(id)`
- `song_title TEXT NOT NULL`
- `artist TEXT NOT NULL`
- `status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE','ATENDIDA','RECHAZADA'))`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- Índice `(event_id, created_at DESC)`.

Aplicar límites de longitud y validación de texto sin espacios vacíos en la base de datos. Agregar índices para las consultas reales, no indiscriminadamente. Usar UTC en almacenamiento y zona horaria local en UI.

### 4.5 Aprovisionamiento seguro

El primer workspace y su membresía deben crearse **en una transacción** usando una operación segura (RPC `SECURITY DEFINER` correctamente restringida, trigger de registro validado o Edge Function autenticada). Debe ser idempotente si se reintenta por corte de red. Evita el caso de crear workspace sin propietario o permitir que otro usuario reclame uno ajeno. Si se usa `SECURITY DEFINER`, fijar `search_path`, restringir `EXECUTE` y verificar explícitamente el usuario.

## 5. Seguridad y aislamiento (bloqueante para lanzamiento)

1. **Activar RLS** en `workspaces`, `workspace_members`, `events`, `song_requests` y cualquier tabla adicional expuesta.
2. Acceso privado condicionado a pertenencia válida al `workspace`. En MVP solamente `owner` puede crear/cerrar eventos y actualizar solicitudes.
3. Probar aislamiento real: DJ A no puede ver ni modificar eventos o canciones de DJ B mediante URL, consultas REST, Realtime o IDs conocidos.
4. RLS de `workspace_members`: permitir al usuario consultar su propia membresía, sin crear recursividad accidental en políticas. No permitir asignación de roles por el cliente.
5. No usar una regla de RLS débil basada únicamente en el `workspace_id` recibido en la petición.
6. Invitado anónimo: **sin `SELECT` ni `UPDATE` ni `DELETE` en `song_requests`**. Tampoco acceso a listas de eventos privados o miembros.
7. La obtención pública de datos del evento debe exponer solo `name` y `is_active`, por `public_code`, mediante Edge Function `get-public-event` (o RPC con permisos mínimos debidamente revisados).
8. **La solicitud anónima pasa por una Edge Function pública `submit-song-request`**. Prohibir inserción pública directa y sin controles a `song_requests`.
9. `submit-song-request` admite únicamente `public_code`, `song_title`, `artist` y, si hace falta, un identificador opaco anti-reintentos. Ignorar/rechazar `status`, `event_id`, `workspace_id`, `role` u otros campos enviados por clientes.
10. Validar y normalizar longitud/contenido en servidor; verificar evento activo en la **misma operación consistente de base de datos** que inserta la solicitud para evitar carreras contra el cierre del evento.
11. Implementar antispam del lado servidor: limitar solicitudes por evento y solicitante/origen mediante mecanismo con almacenamiento compartido y operación atómica (por ejemplo tabla/función SQL con restricciones o servicio especializado si se justifica). No confiar únicamente en `localStorage`, deshabilitar botón o controles frontend. Documentar limitaciones de IP compartida/NAT y posibles defensas adicionales (CAPTCHA cuando sea necesario).
12. Responder `429` cuando exceda el límite y diferenciar errores de validación, evento cerrado e indisponibilidad. No revelar información interna.
13. Mantener `service_role`/claves secretas exclusivamente dentro de Supabase y nunca en navegador ni variables `VITE_*`. Las claves publishable/anon pueden estar en frontend **solo con RLS correctamente aplicada**.
14. Para funciones anónimas sin JWT, configurar el acceso público siguiendo la documentación actual de Supabase (por ejemplo `verify_jwt = false` y autenticación explícita del handler cuando corresponda); que sea accesible sin JWT **no elimina** límites ni validación.
15. CORS limitado a orígenes previstos para navegadores, sin considerarlo mecanismo de autenticación ni protección contra bots.
16. No registrar credenciales, tokens, datos personales ni cuerpos completos de solicitudes de invitados innecesariamente. No subir `.env`, secretos ni claves al repositorio.
17. Separa permisos de creación/actualización de atributos: `owner` no puede cambiar su rol o plan alterando una petición. Usar privilegios por columna, RPC seguro o estructuras que no expongan esos campos.
18. Garantizar que funciones `SECURITY DEFINER` tengan `search_path` explícito, verificaciones de autorización y permisos `EXECUTE` mínimos; probar que no permitan escalamiento de privilegios.
19. Evitar ataques XSS: representar canciones y artistas como texto, nunca como HTML arbitrario.

## 6. Realtime y UX resistente a fallos

- El dashboard se suscribe a cambios de `song_requests` del evento actual mediante Supabase Realtime.
- Suscribir **con sesión DJ autenticada** y RLS que permita leer únicamente los registros de eventos de sus workspaces autorizados.
- Configurar publicación/replicación de la tabla necesaria mediante migraciones o instrucciones verificables.
- Realizar consulta inicial; al reconectar, resincronizar desde base de datos para no perder pedidos.
- Desuscribirse del canal al cambiar de evento o desmontar la pantalla.
- Prevenir duplicados si llegan tanto datos de carga inicial como mensajes Realtime.
- Si Realtime falla, permitir **Actualizar lista** manualmente y mostrar un estado de conectividad discreto.
- Solo confirmar envíos después de respuesta exitosa del servidor; manejar estados de error, carga y reintento.

## 7. Diseño de interfaz e identidad visual

- Marca general **PideBeat**, no SoundTechnology ni DJ-Dev como etiquetas obligatorias.
- Estética musical contemporánea: oscuro, buen contraste, acentos vivos, sin efectos pesados.
- Mobile-first, ancho desde 360 px; también usable en tablets y laptops.
- **Invitado:** pantalla simple con título del evento, 2 inputs, botón principal y mensajes claros. Sin menú, registro o pasos innecesarios.
- **DJ:** login, dashboard de eventos, visualización QR y bandeja de solicitudes con controles táctiles accesibles.
- QR con URL HTTPS real del entorno. No incluir credenciales ni metadatos privados.
- Centralizar nombre comercial, eslogan, logo provisional, colores y URL pública en configuración para poder cambiar marca fácilmente.
- Preparar posibilidad futura de mostrar branding por workspace, **sin construir white-label ni personalización por DJ todavía**.
- Accesibilidad: labels, navegación por teclado, foco visible, mensajes compatibles con lectores de pantalla, contrastes adecuados.

## 8. Estructura de proyecto sugerida

```text
pidebeat/
├── AGENTS.md
├── src/
│   ├── app/                 # Enrutamiento, protección de rutas, bootstrap
│   ├── components/          # Componentes UI reutilizables
│   ├── features/
│   │   ├── auth/
│   │   ├── workspaces/       # Cuenta del DJ (MVP: un workspace propio)
│   │   ├── events/           # Eventos y QR
│   │   └── song-requests/    # Invitado, bandeja DJ y Realtime
│   ├── lib/                 # Cliente Supabase y utilidades
│   ├── config/              # Marca y constantes
│   ├── types/
│   └── styles/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   ├── functions/
│   │   ├── get-public-event/
│   │   │   └── index.ts
│   │   └── submit-song-request/
│   │       └── index.ts
│   └── tests/               # Tests SQL/RLS si aplica
├── .env.example
├── .gitignore
├── README.md
└── vercel.json              # Solo si es necesario para fallback SPA
```

Es una guía, no una obligación de crear carpetas vacías. Mantener responsabilidades claras y evitar abstracciones sin uso.

## 9. Calidad de código

- TypeScript estricto. No usar `any` sin necesidad excepcional documentada.
- Componentes sencillos; funciones preferentemente de hasta **25 líneas** y archivos de hasta **250 líneas** cuando sea razonable, sin fragmentación artificial.
- Aplicar separación entre UI, lógica de dominio, validación, conexión a Supabase y permisos.
- No romper flujos existentes al refactorizar; asegurar estados de carga, error y desconexión.
- Comentarios técnicos en español solo cuando expliquen decisiones no obvias; código autoexplicativo.
- ESLint, formato consistente y manejo centralizado de errores comunes.
- No introducir dependencias innecesarias; no usar mocks como datos reales en producción.
- Tests unitarios de validación, componentes críticos y flujo de creación de solicitudes.
- Tests de integración/RLS para confirmar denegación entre DJs y permisos anónimos. Priorizar estas pruebas sobre tests cosméticos.
- Reportar siempre versiones instaladas y comandos de verificación ejecutados.

## 10. Pruebas de aceptación del MVP

- [ ] DJ A se registra/inicia sesión y tiene workspace propio con rol `owner`.
- [ ] DJ B tiene otro workspace; los recursos no se mezclan.
- [ ] DJ A crea evento con QR/enlace HTTPS público de entropía suficiente.
- [ ] Invitado desde Android/iPhone escanea y abre el formulario sin login ni app.
- [ ] Invitado envía canción y artista; recibe confirmación real de persistencia.
- [ ] El pedido aparece en la bandeja del DJ sin refrescar y sin duplicarse.
- [ ] DJ marca pedido como atendido o rechazado.
- [ ] Al cerrar evento, nuevos pedidos se rechazan desde el servidor incluso con enlace viejo.
- [ ] Invitado anónimo no puede listar solicitudes ni editar datos privados.
- [ ] DJ B no puede acceder a datos de DJ A por REST, Realtime ni UUID conocido.
- [ ] DJ no puede elevar su rol ni asociarse a un workspace ajeno.
- [ ] El control antiabuso limita solicitudes repetitivas en backend y responde correctamente.
- [ ] Realtime recupera datos tras reconexión; opción manual para actualizar.
- [ ] UI responsive, accesible y navegable desde dos dispositivos.
- [ ] `npm run lint`, `npm run build` y `npm run test` terminan satisfactoriamente, o se documentan bloqueos reales.
- [ ] README y `.env.example` permiten reproducir instalación y despliegue sin secretos inventados.

## 11. Entregables y fases de implementación

### Fase A — Preparación

- Revisar repositorio; usar React + Vite + TS + Tailwind y rutas.
- Crear branding PideBeat y UI base responsive.
- Configurar ESLint, testing, `.env.example` y rutas de acceso.

### Fase B — Modelo multi-tenant y autenticación

- Crear SQL versionado: `workspaces`, `workspace_members`, `events`, `song_requests`, índices y constraints.
- Implementar RLS seguro, aprovisionamiento de workspace y registro/login DJ.
- Implementar listado, creación y cierre de eventos autenticados.

### Fase C — QR y solicitud pública

- Implementar QR, enlace compartible y pantalla del invitado.
- Implementar `get-public-event`, `submit-song-request` y validaciones servidor.
- Implementar mitigación antiabuso consistente y cierre atómico de eventos.

### Fase D — Bandeja DJ y tiempo real

- Implementar lista de solicitudes, estados y escucha Realtime.
- Manejar reconexión, duplicados y refresco manual.

### Fase E — Seguridad, pruebas y publicación

- Ejecutar lint/build/tests. Añadir pruebas negativas de acceso cruzado y llamadas anónimas.
- Documentar configuración de Supabase, migraciones, funciones, Realtime y Vercel.
- Escribir en README el paso a paso para probar con **dos celulares diferentes**, uno de invitado y otro de DJ.
- Si faltan credenciales externas, dejar archivos ejecutables y señalar los pasos pendientes sin afirmar despliegues inexistentes.

**Entregables:** frontend, migraciones SQL, RLS, Edge Functions, flujos funcionales, `.env.example`, README español con despliegue y pruebas, resumen de cambios.

## 12. Hoja de ruta FUTURA: vender PideBeat por suscripción (NO IMPLEMENTAR EN MVP)

La primera entrega debe permitir evolucionar hacia estas capacidades, pero **no crear pantallas ni lógica inactiva simulando que están listas**.

### Etapa comercial 2 — SaaS básico

- Plan **Free:** acceso limitado por número de eventos activos y/o solicitudes por evento.
- Plan **Pro:** límites superiores, estadísticas, personalización de QR y marca del DJ.
- Plan **Business:** varios usuarios por workspace, sedes o equipos y capacidades empresariales.
- Administración comercial: catálogo `plans`, relación `workspace_subscriptions` (una suscripción vigente por workspace), historial y estados de periodo.
- Servicio central de **entitlements** / límites que valide siempre en servidor la capacidad habilitada por plan; la UI solo refleja permisos, no los decide.
- Límites atómicos y resistentes a concurrencia, por ejemplo al crear un evento o admitir nuevas solicitudes.

### Etapa comercial 3 — Cobros

- Evaluar proveedor de pago según país de venta, métodos locales, comisiones y soporte de suscripción; **no asumir que un proveedor aplica a todos los países**.
- Diseñar webhooks verificados, idempotentes y persistencia de eventos de facturación; nunca activar un plan Pro solo por respuesta del navegador.
- Manejar estados de suscripción `trialing`, `active`, `past_due`, `canceled`, vencimiento, renovaciones y cancelaciones según el proveedor elegido.
- No almacenar datos de tarjetas ni implementar manejo PCI propio; delegar al proveedor autorizado.
- Distinguir roles: `platform_admin` para administración de PideBeat vs `owner/admin/staff` dentro de un workspace. El rol global **no debe ser editable por el cliente**.
- Reportes, auditoría, soporte, políticas de privacidad, términos y gestión de datos, de acuerdo con los países de operación.

### Decisiones de diseño que SÍ deben respetarse desde MVP

- El propietario de un evento es **un workspace**, no un usuario aislado.
- Los eventos y pedidos están aislados por workspace desde la base de datos.
- No codificar expresiones como `if (djEmail === ...)` ni límites por usuario concreto.
- Localizar lógica de permisos y límites en servicios/funciones centralizados para introducir planes sin reescribir pantallas.
- No usar variables de frontend para decidir si una cuenta es Pro; la futura autorización de planes será del lado servidor.
- Preparar el código para que la UI pueda recibir el nombre y branding del workspace en fases posteriores, sin implementar todavía white-label.
- **No agregar ahora campos o tablas de cobro sin uso**; las migraciones futuras los introducirán de forma versionada.

## 13. Reglas de comunicación con el usuario

1. Al iniciar, explica brevemente qué vas a implementar en el MVP y qué queda para la fase SaaS comercial.
2. En modo Plan, devuelve tareas, cambios y riesgos; **no generes ni modifiques archivos**.
3. En modo Build, genera los archivos y ejecuta las verificaciones posibles.
4. Ante un error, explica causa, efecto y solución sin ocultar problemas.
5. Al finalizar, informa las funcionalidades reales, comandos de prueba, archivos modificados, bloqueos, pasos de credenciales y cómo probar desde dos dispositivos.
6. No pidas un backend propio ni apps móviles para entregar el MVP web.
7. **No implementar pasarelas de pago, suscripciones, estrellas o votaciones sin una nueva solicitud explícita.**

## 14. Primer mensaje sugerido para OpenCode en modo Build

> Lee íntegramente AGENTS.md. Implementa el MVP 1.0 de **PideBeat** con React, Vite, TypeScript, Tailwind, Supabase y Vercel. Debe funcionar para múltiples DJs con datos aislados por workspace y quedar listo para añadir planes y suscripciones en una fase futura, sin implementar pagos ni pantallas premium ahora. Comienza revisando el repositorio y realiza las fases A–E. Crea migraciones, políticas RLS, Edge Functions para solicitudes públicas seguras, QR, formulario del invitado y bandeja Realtime. Ejecuta pruebas e informa qué verificaste realmente y qué configuraciones requieren mis credenciales. No incorpores funcionalidades fuera del alcance.
