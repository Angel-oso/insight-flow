# InsightFlow demo database

Base sencilla para las páginas actuales. La página de feedback consume Convex
para la cola, el detalle, los comentarios y las actividades; las demás páginas
todavía conservan sus datos de demostración locales.

## Páginas y datos

| Ruta | Datos preparados |
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
otra tabla para esta demo. Las categorías son fijas, como en los ajustes actuales.
Las métricas, carga de trabajo, iniciales y antigüedad se derivarán de los datos;
no se guardan contadores ni textos relativos como "Yesterday". Las fechas de
negocio usan milisegundos UTC; `_creationTime` indica cuándo se insertó el documento.
`completedAt` permite calcular la tendencia de resoluciones.

## Datos de ejemplo

- 1 organización: Acme Studio (Demo).
- 5 usuarios y 5 membresías, con correos ficticios `example.com`.
- 3 proyectos: Client Portal, Mobile App y Academy; 8 accesos a proyectos.
- 18 registros de feedback: los 6 estados y las 5 categorías, con distintas
  prioridades, casos sin responsable y remitentes anónimos.
- 3 comentarios y 36 actividades.

Con el servidor Convex configurado en marcha:

```sh
pnpm exec convex run seed:run --push
```

Este comando aplica el esquema y ejecuta la carga. Si el servidor local está
apagado, inicia primero `pnpm exec convex dev` en otra terminal.
La configuración verificada usa `anonymous:anonymous-insight-flow` en
`http://127.0.0.1:3210`; estos datos están en Convex local, no en la nube.

`seed:run` es una mutación interna y atómica. Si ya existe `acme-studio-demo`,
devuelve `created: false` sin duplicar ni modificar los datos. No es una rutina
de reparación si se borran filas manualmente. Un conflicto de slug con otro
proyecto cancela la transacción completa.

No se han añadido autenticación, endpoints públicos, envío de notificaciones ni
un formulario público. Las preferencias y roles están almacenados para la demo;
la autorización deberá implementarse al conectar la interfaz.

Verificado: despliegue local, TypeScript, ESLint, referencias de feedback,
comentarios y actividades, responsables dentro del proyecto y repetición de la
carga sin duplicados.

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
