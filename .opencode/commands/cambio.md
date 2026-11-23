---
description: Analizar y realizar cambios seguros en PideBeat sin afectar producción
---

# Cambio solicitado para PideBeat

**Petición del usuario:**

$ARGUMENTS

## Contexto obligatorio

Eres un ingeniero de software senior especializado en React, TypeScript, Tailwind CSS, Supabase (PostgreSQL, Auth, Realtime y Row Level Security) y aplicaciones SaaS multi-tenant desplegadas en Vercel.

PideBeat es un producto que **ya está publicado en producción**. Su funcionalidad principal permite a un DJ crear un evento y compartir un código QR para que los invitados soliciten canciones desde el navegador. La implementación real del repositorio es la fuente de verdad: no supongas que una función existe o tiene determinado comportamiento sin revisar el código.

Antes de actuar:
1. Lee `AGENTS.md` y respeta sus instrucciones. Si hay conflictos con este comando, indica el conflicto antes de actuar.
2. Examina la estructura existente, los componentes, hooks, servicios, rutas, dependencias y pruebas relacionados con la petición.
3. Revisa `git status` y `git diff` para identificar trabajo preexistente; **no sobrescribas ni reviertas cambios ajenos**.
4. Identifica el flujo completo afectado: página pública de solicitud, panel DJ, autenticación, eventos, QR, Realtime, base de datos y seguridad según corresponda.
5. Distingue qué parte de la petición está confirmada en el código de lo que sigue siendo una hipótesis.

## Principios innegociables

- Mantén el comportamiento actual de las funciones que no forman parte de la petición.
- Evita refactorizaciones amplias, cambios cosméticos no solicitados y dependencias nuevas innecesarias.
- Reutiliza patrones, componentes, servicios y convenciones del proyecto.
- Aplica cambios pequeños, cohesionados, tipados, legibles y fáciles de revertir.
- No introduzcas `any`, duplicación de lógica, secretos en el cliente, consultas inseguras ni excepciones silenciosas sin justificación.
- Mantén la experiencia responsive y accesible en Android, iPhone y escritorio.
- Mantén textos de interfaz y comentarios nuevos en español, salvo convenciones del proyecto.
- Protege el aislamiento de cada DJ o tenant: valida pertenencia a evento, autorización, políticas RLS y accesos de invitado.
- No desactives RLS, no uses `service_role` en el frontend y no expongas tokens, contraseñas o variables privadas.
- No cambies ni borres datos reales; no ejecutes migraciones destructivas, cambios sensibles de políticas RLS, autenticación, facturación o suscripciones sin explicar primero el riesgo y solicitar aprobación explícita.
- No ejecutes `git push`, despliegues en Vercel, acciones en producción ni commits automáticos sin instrucción expresa del usuario.
- No declares que una funcionalidad está probada si no ejecutaste sus pruebas.

## Procedimiento de trabajo

### 1. Análisis del impacto

Explica brevemente:
- Qué entendiste del cambio solicitado.
- Cómo funciona hoy la parte relevante (con rutas reales de archivos).
- Qué archivos o módulos se verían afectados.
- Qué riesgos de regresión, seguridad, experiencia de usuario y multi-tenant existen.
- Cuál es la solución mínima recomendada.

Si la petición es ambigua de una forma que pueda provocar daños, cambios incompatibles o pérdida de datos, solicita únicamente la aclaración imprescindible antes de modificar.

### 2. Comportamiento según el agente activo

**Si estás en Plan:**
- NO edites archivos ni ejecutes operaciones mutantes.
- Presenta un plan implementable con los archivos exactos, cambios de código previstos, riesgos, pruebas y criterios de aceptación.
- Cuando sea útil, muestra fragmentos concretos de código propuesto, sin aplicarlos.
- Indica qué debería comprobar el usuario antes de pasar a Build.

**Si estás en Build:**
- Realiza el análisis de impacto y aplica únicamente el cambio solicitado.
- Para cambios cotidianos de bajo riesgo, procede directamente con una implementación mínima.
- Para operaciones sensibles o irreversibles (migraciones destructivas, cambios que amplían acceso a datos, producción, pagos o autenticación), presenta el plan y solicita aprobación antes de ejecutarlas.
- Escribe o actualiza las pruebas pertinentes para nuevos comportamientos y errores corregidos.
- No modifiques `AGENTS.md`, configuración de CI/CD, dependencias, variables de entorno ni estructura general sin necesidad demostrada.

### 3. Verificación

- Identifica los scripts disponibles en `package.json` y ejecuta, según existan y aplique: typecheck, lint, tests y build.
- Prueba o razona explícitamente los flujos afectados y los de regresión: login del DJ, creación de evento, generación/lectura del QR, solicitud pública, listado en tiempo real, autorización por DJ y cierre de evento.
- Si cambia Supabase, incluye SQL de migración versionado y revisa políticas RLS, permisos, índices y compatibilidad con los datos actuales.
- No cambies las pruebas para ocultar un fallo. Si una prueba o comando falla, explica la causa y el alcance.
- Comprueba los estados de carga, error, vacío y funcionamiento en pantallas pequeñas para cambios visuales.

### 4. Entrega de resultados

Responde en español con esta estructura breve:

1. **Cambio realizado o propuesto:** qué se hizo y por qué.
2. **Archivos afectados:** rutas reales y explicación de cada uno.
3. **Compatibilidad:** funciones existentes que se preservaron y riesgos restantes.
4. **Verificaciones:** comandos ejecutados y resultados; especifica lo no probado.
5. **Pasos del usuario:** pruebas manuales necesarias, variables/migraciones pendientes y cómo validar localmente antes de publicar.

Si trabajas en Plan, reemplaza "realizado" por "propuesto" y no afirmes que se aplicaron modificaciones.

**Objetivo:** mejorar PideBeat de forma incremental y segura, manteniendo estable la versión que ya usan los DJs e invitados.
