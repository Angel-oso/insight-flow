# InsightFlow backend

Convex backend: la página de feedback consume queries para la cola, el
detalle, los comentarios y las actividades; el resto de superficies leen
dashboard, equipo, ajustes y taxonomías del mismo backend.

## Páginas y datos

| Ruta | Datos servidos |
| --- | --- |
| `/projects/[projectSlug]/home` | Feedback por fecha, estado, categoría, prioridad y responsable; actividad reciente. |
| `/projects/[projectSlug]/feedback` | Feedback, remitentes opcionales, asignaciones, comentarios e historial. |
| `/projects/[projectSlug]/team` | Usuarios, roles de organización, fecha de ingreso y acceso a proyectos. |
| `/projects/[projectSlug]/settings` | Identidad, estado, recepción de feedback, prioridad inicial y preferencias de notificaciones. |
| `/home`, `/feedback`, `/team` | Redirigen a Client Portal; no requieren tablas adicionales. |

`organizations` agrupa `projects` y `memberships`; estas relacionan `users` con
roles `admin`, `manager` o `member`. `projectMembers` asigna esas membresías a
proyectos. `feedback` pertenece a un proyecto; `comments` y `activities` apuntan
al feedback mediante IDs de Convex.

El enlace de entrada usa el slug global del proyecto y `inboxEnabled`; no necesita
otra tabla. Las categorías son fijas, como en los ajustes actuales.
Las métricas, carga de trabajo, iniciales y antigüedad se derivarán de los datos;
no se guardan contadores ni textos relativos como "Yesterday". Las fechas de
negocio usan milisegundos UTC; `_creationTime` indica cuándo se insertó el documento.
`completedAt` permite calcular la tendencia de resoluciones.

## Autenticación y autorización

Convex Auth (Google OAuth + email/password) con las tablas `auth*` fusionadas
en el esquema. Ninguna función acepta identidad del cliente: cada query y
mutation resuelve al llamante con `getAuthUserId`, exige su `membership` en la
organización y su link `projectMembers` al proyecto, y aplica capabilities por
rol (`lib/auth/permissions`). `users.current` expone solo la fila propia;
`setup.status` decide el acceso del shell.

Con el servidor Convex en marcha (`npx convex dev` en otra terminal), la
configuración usa el deployment de `.env.local` en `http://127.0.0.1:3210`.

Verificado: despliegue local, TypeScript, ESLint, suite de seguridad
(`convex/security.test.ts`), referencias de feedback, comentarios y
actividades, y responsables dentro del proyecto.

Referencia: [esquemas de Convex](https://docs.convex.dev/database/schemas).

## Convex function examples

Write your Convex functions here.
See https://docs.convex.dev/functions for more.

A query function that takes two arguments looks like:

```ts
// convex/myFunctions.ts
import { query } from "./_generated/server";
import { v } from "convex/values";

export const myQueryFunction = query({
  // Validators for arguments.
  args: {
    first: v.number(),
    second: v.string(),
  },

  // Function implementation.
  handler: async (ctx, args) => {
    // Read the database as many times as you need here.
    // See https://docs.convex.dev/database/reading-data.
    const documents = await ctx.db.query("tablename").collect();

    // Arguments passed from the client are properties of the args object.
    console.log(args.first, args.second);

    // Write arbitrary JavaScript here: filter, aggregate, build derived data,
    // remove non-public properties, or create new objects.
    return documents;
  },
});
```

Using this query function in a React component looks like:

```ts
const data = useQuery(api.myFunctions.myQueryFunction, {
  first: 10,
  second: "hello",
});
```

A mutation function looks like:

```ts
// convex/myFunctions.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const myMutationFunction = mutation({
  // Validators for arguments.
  args: {
    first: v.string(),
    second: v.string(),
  },

  // Function implementation.
  handler: async (ctx, args) => {
    // Insert or modify documents in the database here.
    // Mutations can also read from the database like queries.
    // See https://docs.convex.dev/database/writing-data.
    const message = { body: args.first, author: args.second };
    const id = await ctx.db.insert("messages", message);

    // Optionally, return a value from your mutation.
    return await ctx.db.get("messages", id);
  },
});
```

Using this mutation function in a React component looks like:

```ts
const mutation = useMutation(api.myFunctions.myMutationFunction);
function handleButtonPress() {
  // fire and forget, the most common way to use mutations
  mutation({ first: "Hello!", second: "me" });
  // OR
  // use the result once the mutation has completed
  mutation({ first: "Hello!", second: "me" }).then((result) =>
    console.log(result),
  );
}
```

Use the Convex CLI to push your functions to a deployment. See everything
the Convex CLI can do by running `npx convex -h` in your project root
directory. To learn more, launch the docs with `npx convex docs`.
