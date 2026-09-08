# InsightFlow

**Convierte feedback disperso en decisiones de producto claras y trazables.**

InsightFlow es una aplicación web multi-tenant donde los equipos reciben feedback
por un enlace público, lo clasifican por proyecto, categoría, estado y prioridad,
asignan responsables y ven la salud de cada proyecto en un dashboard pensado
para decidir dónde intervenir.

---

## Por qué existe

El feedback suele vivir disperso: conversaciones de soporte, formularios, emails,
llamadas, hojas de cálculo y mensajes informales. Eso produce cuatro fallos
prácticos:

- Se pierden solicitudes valiosas o se duplican.
- El feedback importante no se distingue de opiniones aisladas.
- Nadie ve qué proyectos acumulan riesgo o backlog.
- Nadie puede explicar por qué algo se priorizó, se completó o se descartó.

InsightFlow da **un solo flujo**: recolectar por enlace público, organizar por
proyecto, asignar dueños, mover cada item por un ciclo de vida claro y ver
volumen, urgencia y salud en un dashboard. A propósito **simple antes que
inteligente**: clasificación y priorización manual primero; nada de IA,
automatizaciones ni scoring en el MVP.

---

## Qué incluye

| Página | Ruta | Estado de datos |
| --- | --- | --- |
| Overview del proyecto | `/projects/[slug]/home` | Backend Convex real |
| Cola de feedback | `/projects/[slug]/feedback` | Backend Convex real |
| Equipo | `/projects/[slug]/team` | Datos locales de demo |
| Ajustes del proyecto | `/projects/[slug]/settings` | Local (localStorage) |

### Overview (`home`)

Vista lista-para-decidir: brief de intervención, banda de métricas (recibido,
abierto, críticos, resolución), salud del proyecto, movimiento de feedback
(recibido vs. resuelto por día), composición del backlog, cola de "Needs
intervention" con deep-link a cada item y actividad reciente. Todo calculado en
el backend con una sola query transaccional (`api.overview.get`).

### Feedback (`feedback`)

Cola filtrable con búsqueda, filtros por estado/prioridad/categoría/fecha,
paginación y filas expandibles: al abrir un item se cargan sus comentarios y su
historial, y la selección vive en la URL (`?feedback=<id>`), así que es
compartible y funciona con atrás/adelante. Mutaciones reales para clasificar,
asignar, cambiar estado y comentar, cada una generando su actividad.

### Taxonomías editables desde la BD

Estados, categorías y prioridades no están quemados en código: viven en la tabla
`taxonomies` como documentos JSON (`value`, `label`, `rank`, `tone`,
`chartToken`, `description`). Cada superficie (filtros, badges, donut, settings)
consulta texto, nivel y color desde la base. Cambiar un label o un tono en la
tabla se refleja en toda la app sin deploy. La validación dura sigue en los
unions del schema; `value` es la clave estable y no debe editarse.

---

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Backend | Convex (base de datos, queries, mutaciones, realtime) |
| UI | Tailwind CSS 4, shadcn/ui, Base UI, Lucide |
| Gráficas | Tanstack Charts |
| Estado URL | nuqs |
| Fuentes | Inter (UI) + Manrope (display) |

---

## Arquitectura

```text
app/(app)/projects/[projectSlug]/
├── home/page.tsx        →  Dashboard (overview)
├── feedback/page.tsx    →  Feedback (cola + detalle)
├── team/page.tsx        →  Equipo (demo local)
└── settings/page.tsx    →  Ajustes (demo local)

components/
├── home/dashboard/      →  paneles + model.ts (presentación) + use-overview.ts
├── feedback/            →  workspace, lista acordeón, detalle, filtros, model.ts
├── project-settings/    →  ajustes (lee taxonomías vía useTaxonomies)
└── ui/                  →  shadcn/ui

convex/
├── schema.ts            →  9 tablas + índices
├── feedback.ts          →  workspace, detail, update, addComment
├── overview.ts          →  get (agregados del dashboard)
├── taxonomies.ts        →  list, ensureDefaults + helpers
├── feedback/access.ts   →  requireProject/requireFeedback + listados acotados
└── seed.ts              →  datos demo idempotentes (Acme Studio)

lib/
├── projects.ts          →  catálogo de proyectos demo
├── taxonomy.ts          →  tipos, mapa tono→clases, hook useTaxonomies
└── auth/permissions.ts  →  roles (admin/manager/member) y capabilities
```

**Convenciones que se respetan en todo el backend:**

- Lecturas siempre por índice (`withIndex`), nunca `filter()` como WHERE.
- Colecciones acotadas (`take(n)`); el workspace limita a 200 items por proyecto.
- Sin wall-clock en queries: el `now` entra por argumento y el cliente lo
  refresca cada 60 segundos.
- Validadores `args` + `returns` en cada función (object-form).
- Sin contadores guardados: métricas, antigüedad y tiempos relativos se derivan.

---

## Modelo de datos

```text
organizations ─┬─ memberships (user + role) ─┬─ projectMembers ── projects
               │                              │
               └─ users                       └─ feedback ─┬─ comments
                                                          └─ activities

taxonomies (global): status · category · priority  →  display metadata JSON
```

**Reglas de negocio transparentes** (las mismas en backend y UI):

- **Abierto**: todo lo que no sea `Completed` ni `Discarded`.
- **Stale**: abierto sin actividad ≥ 7 días.
- **Needs attention**: abierto + (Critical, High, sin dueño o stale).
- **Salud**: `At risk` (≥ 1 crítico abierto) · `Needs attention` (backlog sin
  críticos) · `Healthy` (cero abierto).

---

## Puesta en marcha

Requisitos: Node 20+ y `pnpm`.

```bash
pnpm install
```

La app necesita **dos** procesos: Next.js y Convex (el segundo empuja schema y
funciones al deployment de `.env.local`).

```bash
# Terminal 1 — backend (codegen + push de schema en cada cambio)
npx convex dev

# Terminal 2 — frontend
pnpm dev
```

Abre `http://localhost:3000/projects/academy/home`.

### Sembrar la demo

El seed es idempotente (repetirlo preserva tus ediciones). Como `seed:run` es
interna, ejecútala desde el dashboard de Convex (**Functions → seed:run**) o con
la CLI si la expones. Crea:

- Org `Acme Studio (Demo)` + 5 usuarios con roles + 3 proyectos.
- 18 feedbacks cubriendo los 6 estados, 5 categorías y casos sin dueño.
- Las 3 taxonomías (`status`, `category`, `priority`).
- Comentarios y actividades de ejemplo.

Las variables necesarias viven en `.env.local`:

```bash
CONVEX_DEPLOYMENT=...
NEXT_PUBLIC_CONVEX_URL=...
NEXT_PUBLIC_CONVEX_SITE_URL=...
NEXT_PUBLIC_CONVEX_URL=... # (frontend)
```

### Scripts

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Next.js en desarrollo |
| `pnpm build` / `pnpm start` | Build y servidor de producción |
| `pnpm lint` | ESLint |
| `npx tsc --noEmit` | Typecheck (atrapa casi todo antes del deploy) |
| `npx convex dev` | Backend en watch + codegen |
| `npx convex run taxonomies:ensureDefaults` | Re-sembrar taxonomías (requiere exponerla) |

---

## Roles y permisos

| Rol | Puede |
| --- | --- |
| Admin | Todo: triage, asignar, actualizar, comentar, gestionar |
| Manager | Triage, asignar, actualizar y comentar (sin administración global) |
| Member | Comentar y actualizar solo su feedback asignado |

Las capabilities viven en `lib/auth/permissions.ts` y se exigen en el backend
(`requireCapability`), nunca solo en la UI.

---

## Decisiones deliberately simples (y qué sigue)

**Hoy no hay**: auth real (identidad demo compartida), intake público
(formulario por slug), paginación en servidor, notificaciones, ni import/export.
El filtro y la paginación del feedback son en cliente sobre un máximo de 200
items; moverlos al backend es el siguiente paso natural cuando el volumen crezca.

**Futuro**: intake público con mutación `submit`, autenticación, creación de
orgs/proyectos/usuarios desde la UI, página admin para editar taxonomías
(la arquitectura ya lo permite: solo falta mutación + UI), y agregados con
`@convex-dev/aggregate` si los conteos se vuelven costosos.

---

*Diseñado y construido como caso end-to-end de producto + frontend: intake
público, workflows por rol, priorización de feedback y dashboards responsivos
para decidir.*
