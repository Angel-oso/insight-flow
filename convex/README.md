# InsightFlow backend

Backend Convex de InsightFlow. Todas las superficies de la app (overview,
bandeja de feedback, equipo, ajustes y el formulario público) leen y escriben
aquí; no hay datos simulados ni seed.

## Módulos

| Módulo | Funciones públicas |
| --- | --- |
| `setup/` | `queries.status` (gate del shell), `mutations.createWorkspace` (organización + primer proyecto) |
| `organizations/` | `queries.mine/overview/settings`, `mutations.rename/transferOwnership` |
| `projects/` | `queries.list`, `mutations.create`, `settings.get/update/restore/access`, roles por proyecto (`roles`, `createRole`, `deleteRole`) |
| `feedback/` | `queries.workspace/detail`, `mutations.update/create/addComment` |
| `intake/` | `public.form` y `public.submit` (anónimas) |
| `dashboard/` | `overview.get` (ventana `from`/`to` de hasta 365 días, vistas por rol) |
| `team/` | `queries.get`, `mutations.setMemberRole/removeMember` |
| `invitations/` | `actions.create`, `mutations.accept`, `queries.preview` |
| `taxonomies/` | `queries.list`, `mutations.createOption/updateOption/removeOption` |
| `users/` | `queries.current`, `account.update` |

## Modelo

`organizations` agrupa `projects` y sus `taxonomies` (estados, categorías y
prioridades propias de cada organización). `organizationMembers` vincula
usuarios con una organización; `projectMembers` les da acceso a un proyecto con
un rol. `roles` contiene los tres roles base (`admin`, `manager`, `member`, sin
`projectId`) y los roles personalizados de cada proyecto; cada rol referencia
sus permisos en `permissions`.

`feedback` pertenece a un proyecto; `comments` y `activities` apuntan al
feedback. El enlace público usa el slug del proyecto y solo acepta envíos si el
proyecto está `Active` y `inboxEnabled` es verdadero. Las métricas, cargas de
trabajo y antigüedades se derivan; no se guardan contadores. Las fechas de
negocio son milisegundos UTC y `completedAt` alimenta la tendencia de
resoluciones.

## Autenticación y autorización

Convex Auth (Google OAuth + email/password) con las tablas `auth*` fusionadas
en el esquema. Ninguna función acepta identidad del cliente: cada query y
mutation resuelve al llamante con `getAuthUserId`, exige pertenecer al
proyecto (`requireProject`) y comprueba la capacidad necesaria
(`requireCapability`). Los roles base aplican en cualquier proyecto vinculado;
los personalizados solo en el proyecto que los define. Cambiar los permisos de
un rol afecta a todos sus usuarios sin editar cada cuenta.

Las únicas funciones anónimas son `intake.public.form`, que expone solo
nombre, descripción, estado de recepción y categorías del proyecto, e
`intake.public.submit`, que valida cada campo en el servidor.
`invitations.queries.preview` exige sesión y no lee el reloj: el cliente
deriva la caducidad de `expiresAt`.

Las métricas de organización solo llegan a quien tiene `organization.manage`
en su membresía de organización; el resto recibe únicamente sus proyectos. La
carga por persona del overview de proyecto solo llega a quien tiene
`feedback.assign`. Un proyecto archivado rechaza cambios de equipo, roles e
invitaciones hasta que se restaura.

Tope de permisos: nadie puede invitar con un rol que tenga más permisos que
los suyos, ni quitar del proyecto a alguien con más permisos que él.

Los campos `users.organizationId` y `users.roleIds` son legacy y no conceden
acceso. Si una base de datos tiene usuarios creados con ellos, ejecuta una vez
`npx convex run setup/admin:migrateLegacyMemberships '{"cursor": null}'`
(repite con `continueCursor` hasta que `isDone` sea verdadero).

## Tests

`pnpm test` ejecuta las suites en memoria (convex-test, sin red):

- `security.test.ts`: aislamiento entre organizaciones y proyectos,
  capacidades por rol, invitaciones, gestión de miembros y archivado.
- `taxonomies/organization.test.ts`: taxonomías por organización.
- `intake/public.test.ts`: formulario público y validación de envíos.
- `dashboard/*.test.ts`: overview por rol, ventanas de fechas y regla de salud.
- `organizations/workspace.test.ts`: overview de organización, ajustes y
  onboarding.
- `projects/archived.test.ts`: bloqueo de proyectos archivados e invitaciones.

Con el servidor en marcha (`npx convex dev`), el deployment de `.env.local`
corre en `http://127.0.0.1:3210`.

Referencia: [funciones de Convex](https://docs.convex.dev/functions).
