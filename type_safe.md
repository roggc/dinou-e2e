# 🛡️ Sistema de Type-Safe Routing en Dinou (Nivel 1 y Nivel 2)

Dinou incorpora un sistema de **rutas tipadas (Type-Safe Routing)** completo, elegante y con **cero coste en tiempo de ejecución (0 bytes en runtime)**. 

Este sistema transforma la experiencia de desarrollo (DX):
1. **Hacia afuera:** Autocompletado de URLs válidas y detección inmediata de enlaces rotos en `<Link>` y `useRouter()`.
2. **Hacia adentro:** Parámetros estrictamente tipados en los componentes `Page` y `Layout`, eliminando por completo la necesidad de escribir `params: any`.

---

## 🚀 1. Resumen Rápido para el Usuario

### Enlaces y Navegación (Nivel 1)
```tsx
import { Link, useRouter } from "dinou";

export default function Navigation() {
  const router = useRouter();

  return (
    <nav>
      {/* ✅ Autocompletado instantáneo en el editor */}
      <Link href="/demo/cookies">Cookies</Link>

      {/* ✅ Rutas dinámicas con template strings */}
      <Link href={`/blog/${post.slug}`}>Ver Post</Link>

      {/* ✅ Soporte para queries, hashes, rutas relativas y URLs externas */}
      <Link href="/demo?tab=settings#seccion-1">Ajustes</Link>
      <Link href="../contacto">Relativo</Link>
      <Link href="https://github.com">Externo</Link>

      {/* ❌ Error en rojo de TypeScript al escribir una ruta que no existe */}
      {/* <Link href="/ruta-inventada" /> */}

      <button onClick={() => router.push("/demo/redirects")}>
        Ir a Redirects
      </button>
    </nav>
  );
}
```

### Páginas, Layouts y Funciones de Servidor Tipadas (Nivel 2)
```tsx
import type { PageProps, LayoutProps, RouteParams } from "dinou";

// src/blog/[slug]/page.tsx
export default function BlogPost({ params }: PageProps<"/blog/[slug]">) {
  // ✅ params.slug tiene tipo `string` automáticamente
  console.log(params.slug);

  // ❌ Error de TypeScript: Property 'id' does not exist on type '{ slug: string }'
  // console.log(params.id);

  return <h1>Post: {params.slug}</h1>;
}

// src/blog/[slug]/layout.tsx
export function BlogLayout({ children, params }: LayoutProps<"/blog/[slug]">) {
  return (
    <section>
      <header>Categoría de {params.slug}</header>
      <main>{children}</main>
    </section>
  );
}

// src/blog/[slug]/page_functions.ts
export async function getProps(params: RouteParams<"/blog/[slug]">) {
  // ✅ Tipa directamente el objeto params sin `params: any`
  return {
    title: `Post: ${params.slug}`,
  };
}
```

---

## 🧩 2. Tabla de Correspondencia de Parámetros

Dinou traduce automáticamente las convenciones del sistema de archivos a tipos de TypeScript:

| Convención de Carpeta | Tipo de Parámetro Inferido | Ejemplo de Ruta | Tipo de `params` |
| :--- | :--- | :--- | :--- |
| **Estática** | Sin parámetros | `src/about/page.tsx` | `Record<string, never>` |
| **Dinámica simple** `[id]` | `string` | `src/blog/[id]/page.tsx` | `{ id: string }` |
| **Catch-all** `[...slug]` | `string[]` | `src/docs/[...slug]/page.tsx` | `{ slug: string[] }` |
| **Opcional simple** `[[lang]]` | `string \| undefined` | `src/[[lang]]/page.tsx` | `{ lang?: string }` |
| **Catch-all opcional** `[[...opt]]` | `string[] \| undefined` | `src/shop/[[...opt]]/page.tsx` | `{ opt?: string[] }` |
| **Múltiples parámetros** | Mixtos según orden | `src/users/[uId]/posts/[pId]` | `{ uId: string; pId: string }` |
| **Opcionales anidados** | Dependientes posicionales | `inventory/[[wh]]/[[aisle]]` | `{ wh?: string; aisle?: string }` |

> **Nota sobre rutas opcionales (`[[foo]]` y `[[...opt]]`):**
> Dinou genera tanto la versión con parámetros como la versión base sin parámetros. 
> Por ejemplo, para `src/t-params/[[slug]]/page.tsx`, tanto `<Link href="/t-params" />` como `<Link href="/t-params/mi-item" />` son enlaces válidos y autocompletados.

---

## 🏗️ 3. Arquitectura Técnica: Cómo Funciona por Debajo

El sistema consta de 4 piezas modulares que interactúan de forma limpia:

```mermaid
flowchart TD
    A["src/ (Carpetas y páginas)"] --> B["dinou/core/generate-route-types.js"]
    B --> C[".dinou/types/routes.d.ts"]
    C --> D["dinou-env.d.ts"]
    D --> E["dinou/index.d.ts (DinouRoute & PageProps)"]
    E --> F["IDE (Autocompletado en VSCode/Cursor) y tsc"]
    
    G["dinou dev (Watcher)"] -- "Al añadir/eliminar page.*" --> B
    H["dinou build (Node/Bun/Deno/Edge)"] -- "Al iniciar compilación" --> B
```

### 1. El Generador Ligero (`dinou/core/generate-route-types.js`)
* Realiza un escaneo directo de nombres de archivo y carpetas en `src/` mediante `readdirSync`.
* **Cero ejecución de código:** No importa archivos del usuario, no ejecuta `getStaticPaths()`, ni monta servidores mock. Tarda apenas **2 milisegundos**.
* Ignora carpetas privadas `_*` y slots paralelos `@*`.
* Desempaqueta limpiamente los Route Groups `(group)` (no forman parte de la URL).
* Desgrana recursivamente los segmentos opcionales finales (`[[foo]]`) para registrar todas las combinaciones estáticas y dinámicas posibles.

### 2. Archivo de Definiciones (`.dinou/types/routes.d.ts`)
* Es autogenerado por Dinou en la raíz del proyecto.
* Declara la unión `DinouStaticRoutes` y las plantillas `DinouDynamicRoutes`.
* Declara el mapa estricto `DinouRouteParamsMap` con todos los parámetros conocidos de cada ruta.
* Realiza un **Module Augmentation** limpio sobre el paquete `"dinou"`:
  ```typescript
  import "dinou";

  declare module "dinou" {
    namespace DinouRouter {
      interface Register {
        route: DinouGeneratedRoute;
        params: DinouRouteParamsMap;
      }
    }
  }
  ```

### 3. Tipos Maestros del Framework (`dinou/index.d.ts`)

#### 🌟 Los 4 Tipos Principales para Desarrolladores:
| Tipo Exportado | Propósito Principal | Ejemplo en Código Real |
| :--- | :--- | :--- |
| **`PageProps<T>`** | Para componentes React de página (`page.tsx`) | `BlogPost({ params }: PageProps<"/blog/[slug]">)` |
| **`LayoutProps<T>`** | Para componentes React de layout (`layout.tsx`) | `BlogLayout({ children, params }: LayoutProps<"/blog/[slug]">)` |
| **`RouteParams<T>`** | Para funciones puras y servicios (`getProps`, `error.tsx`, helpers) | `getProps(params: RouteParams<"/blog/[slug]">)` |
| **`DinouRoute`** | Para props de URL, `<Link>`, `useRouter()` y componentes propios | `interface NavProps { href: DinouRoute }` |

#### 🔧 Tipos Internos Exportados por Fontanería de TypeScript:
* **`DinouRouter.Register`**: Interfaz extensible necesaria para el *Module Augmentation* de TypeScript. TypeScript no permite extender interfaces no exportadas desde módulos externos.
* **`DinouRoutePattern`**: La unión de todos los patrones de carpetas (ej: `"/blog/[slug]"`). Se exporta porque `PageProps<T extends DinouRoutePattern>` exige que su restricción genérica sea pública para evitar errores de tipo privado (TS4058).
* **`ExtractRouteParams<T>`**: Tipo condicional recursivo (`${infer Start}/${infer Rest}`) que actúa como motor de reserva cuando no hay tipos generados.

### 4. Integración Automática (`dinou-env.d.ts`)
* Al ejecutarse, el generador asegura que [dinou-env.d.ts](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou-env.d.ts) contenga:
  ```typescript
  /// <reference path="./.dinou/types/routes.d.ts" />
  ```
  De este modo, tanto el editor como el compilador `tsc` reconocen los tipos en todo el proyecto de inmediato.

---

## ⚡ 4. Ciclo de Vida: Dev Server y Compilación de Producción

### En Desarrollo (`npm run dev`)
* En [dinou/node/dev.mjs](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/node/dev.mjs), se invoca `generateRouteTypes()` al inicio.
* El watcher `srcWatcher` (basado en Chokidar) escucha eventos de creación (`add`) y borrado (`unlink`) de archivos `page.(tsx|jsx|ts|js)`.
* Al añadir o eliminar una página, regenera `.dinou/types/routes.d.ts` al vuelo en ~2ms, por lo que **el editor actualiza el autocompletado en tiempo real sin reiniciar el servidor**.

### En Compilaciones de Producción (`npm run build`)
* Todos los constructores de Dinou ([dinou/node/bundle-dual-engine.mjs](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/node/bundle-dual-engine.mjs), [dinou/bun/build.mjs](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/bun/build.mjs), [dinou/deno/build.mjs](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/deno/build.mjs) y [dinou/cloudflare/build.mjs](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/cloudflare/build.mjs)) ejecutan `generateRouteTypes()` al arrancar.
* Esto garantiza que en entornos limpios de **CI/CD (GitHub Actions, Docker, Vercel, etc.)**, donde la carpeta `.dinou/` no está commiteada en git, los tipos se creen antes de que cualquier chequeo de tipos (`tsc`) o empaquetador los necesite.

---

## 💡 5. Ejemplos Avanzados de Uso

### Acceder a Query Parameters (`useSearchParams`)
En Dinou, las páginas no reciben `searchParams` por props, sino a través del hook oficial `useSearchParams()` (compatible tanto en **Server Components** como en **Client Components**):

```tsx
import { useSearchParams, type PageProps } from "dinou";

export default function SearchPage({ params }: PageProps<"/search">) {
  const searchParams = useSearchParams();
  const query = searchParams.get("q"); // string | null

  return <div>Buscando: {query}</div>;
}
```

Y en el archivo de servidor `page_functions.ts`, puedes acceder a los query parameters de la petición mediante `getContext()` y tipar estrictamente los parámetros recibidos mediante `RouteParams`:

```typescript
import { getContext, type RouteParams } from "dinou";

export async function getProps(params: RouteParams<"/blog/[slug]">) {
  const ctx = getContext();
  const query = ctx.req?.query; // { q: "..." }
  return {
    postSlug: params.slug, // ✅ Estrictamente tipado sin `any`
    initialQuery: query?.q ?? "",
  };
}
```

### Flujo de Desarrollo: Elegir la Ruta en las Páginas
Al tipar un componente de página:
1. Importa `PageProps` desde `"dinou"`.
2. Escribe `PageProps<"">` en la declaración de tu componente.
3. Abre el autocompletado (`Ctrl + Espacio` o `Cmd + Espacio`). Tu IDE mostrará todas las rutas registradas en el proyecto (ej: `"/blog/[slug]"`, `"/search"`).
4. Elige tu ruta. A partir de ese momento, `params` queda fuertemente tipado con sus parámetros correctos:

```tsx
import type { PageProps } from "dinou";

// Pulsa Ctrl + Espacio dentro de "" para elegir tu ruta
export default function BlogPost({ params }: PageProps<"/blog/[slug]">) {
  return <h1>{params.slug}</h1>;
}
```

### Tipar Páginas de Error (`error.tsx`) sin `any`
En Dinou, los componentes de error (`error.tsx`, incluidos los slots paralelos `@slot/error.tsx`) reciben exactamente 2 props:
- `error`: El error capturado, que cumple estructuralmente la interfaz nativa `Error` de TypeScript (`{ message: string; name: string; stack?: string }`).
- `params`: Los parámetros dinámicos de la ruta, tipados limpiamente con `RouteParams<T>`.

Puedes tipar tus páginas de error con `RouteParams`:

```tsx
"use client";

import { useRouter, type RouteParams } from "dinou";

interface BlogPostErrorProps {
  error: Error;
  params: RouteParams<"/blog/[slug]">;
}

export default function BlogPostError({ params, error }: BlogPostErrorProps) {
  const router = useRouter();

  return (
    <div className="error-container">
      <h2>Error al cargar el post: {params.slug}</h2>
      <p>{error.message}</p>
      {/* Recarga suave vía router de cliente */}
      <button onClick={() => router.refresh()}>Reintentar</button>
    </div>
  );
}
```

> **Diferencias Clave con Otros Frameworks:**
> * En Next.js, `error.tsx` está forzado a ser Client Component y recibe `{ error, reset }`.
> * En Dinou, `error.tsx` puede ser un **Server Component o un Client Component**. Dinou pasa `{ error, params }`. Para reintentar, se usa `useRouter().refresh()` o la navegación estándar del navegador.

### Crear Componentes de Navegación Propios con `DinouRoute`
Al construir componentes reutilizables (como botones estilizados, barras de navegación o migas de pan), tipa la prop `href` o `to` con `DinouRoute`. Tu componente heredará autocompletado inmediato y detección de enlaces rotos en tiempo de compilación:

```tsx
import type { DinouRoute } from "dinou";
import { Link } from "dinou";

interface NavButtonProps {
  href: DinouRoute; // 👈 ¡Hereda autocompletado y validación de rutas!
  label: string;
}

export function NavButton({ href, label }: NavButtonProps) {
  return (
    <Link href={href} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white">
      {label}
    </Link>
  );
}

// Uso en la aplicación:
const menu: { label: string; href: DinouRoute }[] = [
  { label: "Dashboard", href: "/demo" },          // ✅ Autocompletado
  { label: "Cookies", href: "/demo/cookies" },    // ✅ Autocompletado
  // { label: "Roto", href: "/ruta-inexistente" }, // ❌ ¡Error de compilación TypeScript!
];
```

### Navegación Dinámica con Parámetros Tipados
```tsx
import { Link, useRouter } from "dinou";

interface Item {
  id: string;
  name: string;
}

export function ItemCard({ item }: { item: Item }) {
  const router = useRouter();

  return (
    <div>
      {/* Interpolación de strings validada contra la plantilla `/items/${string | number}` */}
      <Link href={`/items/${item.id}`}>{item.name}</Link>

      <button onClick={() => router.push(`/items/${item.id}`)}>
        Detalles
      </button>
    </div>
  );
}
```

### ⚠️ Barras Finales (Trailing Slashes) y Limitación de Template Literals en TypeScript

> [!WARNING]
> **¡Cuidado con las barras finales (`/`) en rutas dinámicas!**
>
> En TypeScript, los *template literal types* consideran que `${string}` encaja con *cualquier* cadena, incluida la cadena vacía `""` (ya que `"" extends string` es `true`).
>
> **El escenario:**
> Imagina una ruta anidada con múltiples parámetros como `src/t-groups-params/[id]/(foo)/[slug]/page.tsx`, cuya plantilla generada es:
> ```typescript
> `/t-groups-params/${string | number}/${string | number}`
> ```
> Si se omite por error el segundo parámetro (`slug`) pero se añade una barra al final:
> ```tsx
> // ⚠️ ¡TypeScript compila sin emitir ningún error!
> <Link href={`/t-groups-params/${id}/`}>Ver</Link>
> ```
> TypeScript interpreta:
> 1. El primer `${string | number}` coincide con `id`.
> 2. El delimitador literal `/` coincide con la barra final.
> 3. El segundo `${string | number}` (`slug`) coincide con la cadena vacía `""`.
>
> **Impacto en tiempo de ejecución (404 Not Found):**
> Dinou normaliza las barras finales en tiempo de ejecución, por lo que `/t-groups-params/123/` se resuelve como `/t-groups-params/123`. Dado que no existe ningún `page.tsx` en el segmento intermedio `/t-groups-params/[id]`, la petición devolverá un **404 Not Found** en el navegador.
>
> **¿Por qué Dinou no bloquea esto en el sistema de tipos?**
> Para prohibir esto en TypeScript sería necesario hacer genéricos `<Link>` y los métodos del router, aplicando tipos condicionales recursivos complejos para validar la ausencia de barras finales. Esto degradaría notablemente la velocidad de autocompletado en el IDE (IntelliSense) y ralentizaría la comprobación con `tsc` en proyectos grandes. Frameworks líderes de la industria como Next.js (`typedRoutes`) adoptan exactamente este mismo compromiso de diseño por rendimiento.
>
> **Buenas prácticas:**
> * Evitar añadir barras finales al construir URLs dinámicas.
> * Observa que cuando se escribe **sin** la barra final:
>   ```tsx
>   // ❌ ¡TypeScript detecta el parámetro ausente y emite error de compilación!
>   <Link href={`/t-groups-params/${id}`}>Ver</Link>
>   ```
>   TypeScript comprueba correctamente la ausencia del segundo segmento e impide la compilación.

---

## 🛡️ 6. Compatibilidad y Cero Riesgo
* **Retrocompatibilidad:** Si en una página antigua o migrada no quieres especificar el tipo de ruta, puedes seguir usando `export default function Page({ params }: any)` o `PageProps` genérico. Nada se rompe.
* **Cero bytes en producción:** Todo ocurre en archivos `.d.ts`. Ningún archivo JavaScript distribuido en el bundle final contiene código adicional.
