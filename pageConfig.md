# Traspaso de Conocimiento: `export default pageConfig` y `layoutConfig` (Dinou v7.1.0)

Este documento detalla la funcionalidad introducida en **Dinou v7.1.0**, las motivaciones de diseño arquitectónico y todas las ventajas de experiencia de desarrollo (DX) y tipado en TypeScript. Está redactado para servir como base de conocimiento para la documentación oficial en `dinou-docs`.

---

## 1. Resumen de la Novedad en v7.1.0

A partir de la versión **7.1.0**, Dinou soporta oficialmente **dos modelos de declaración** para los contratos de ciclo de vida de rutas en `page_functions` y `layout_functions`:

1. **Modelo Tradicional (Named Exports):** Exportaciones nombradas individuales de cada contrato (`export const revalidate = ...`, `export const getProps = ...`, etc.).
2. **Modelo Consolidado (Default Export Config Object - Nuevo):** Exportación de un único objeto de configuración tipado mediante `export default pageConfig` o `export default layoutConfig`.

Ambos modelos son **completamente intercambiables y retrocompatibles**: una aplicación puede mezclar archivos con exportaciones nombradas y archivos con `export default`, tanto en modo estándar (sin eyectar) como en modo eyectado (`dinou eject`).

---

## 2. Motivación y Razones del Cambio

### 2.1. Resolución de Asimetría en el Framework
En los archivos de tipos de Dinou (`dinou/index.d.ts`), ya existían las interfaces oficiales:
```ts
export type PageFunctions<TRouteOrParams = any, TProps = any> = RouteSegmentConfig<...>;
export type LayoutFunctions<TRouteOrParams = any, TProps = any> = RouteSegmentConfig<...>;
```
Sin embargo, existía una **asimetría arquitectónica**:
- El sistema de tipos de TypeScript definía `PageFunctions` como un **objeto** (`RouteSegmentConfig`).
- El runtime de Dinou (anteriores a v7.1) sólo inspeccionaba **exportaciones nombradas sueltas** a nivel de módulo (`mod.getProps`, `mod.revalidate`, etc.).

Esto convertía a `PageFunctions` y `LayoutFunctions` en tipos "huérfanos": no podían asignarse a una única exportación por defecto reconocida por el motor.

### 2.2. La Fragilidad de los Workarounds Anteriores
Antes de v7.1.0, los desarrolladores que querían usar `PageFunctions` para tipar todo en un solo bloque recurrían a desestructuraciones forzadas:

```ts
// ⚠️ Workaround anterior a v7.1.0
const pageConfig: PageFunctions<"/blog/[slug]", BlogProps> = {
  ppr: true,
  revalidate: 60,
  getProps: async (params) => { ... },
  validateParams: (params) => { ... },
  allowISG: false,
};

// Se requería esta desestructuración manual para que el runtime lo reconociera:
export const { ppr, revalidate, getProps, validateParams, allowISG } = pageConfig;
```

Este workaround presentaba dos graves problemas:
1. **Desincronización silenciosa (Human Error):** Si un desarrollador añadía una nueva propiedad al objeto (como `allowISG: false` o `getCacheTags`) pero olvidaba incluirla en el destructuring final, TypeScript no arrojaba ningún error, pero Dinou nunca recibía esa configuración en tiempo de ejecución.
2. **Limitaciones de Análisis Estático (AST):** Herramientas como SWC o Babel identifican fácilmente declaraciones directas (`Identifier`), pero los patrones de desestructuración (`ObjectPattern`) complican o impiden la extracción estática en compilación (por ejemplo, para la detección de `ppr` previa a la ejecución).

Con el soporte nativo de `export default pageConfig`, ese workaround se elimina por completo.

---

## 3. Ejemplo Comparativo de Código

### A) Antes (o con Named Exports)
```ts
// src/blog/[slug]/page_functions.ts
import type { RouteParams } from "dinou";

type BlogParams = RouteParams<"/blog/[slug]">;

export const ppr = true;
export const revalidate = 60;
export const allowISG = true;

export const getStaticPaths = async () => ["introduccion", "novedades-v7"];

export const validateParams = (params: BlogParams) => Boolean(params?.slug);

export const getCacheTags = (params: BlogParams) => ["blog", `post-${params?.slug}`];

export const getProps = async (params: BlogParams) => {
  const post = await fetchPost(params.slug);
  return { post };
};
```

### B) En v7.1.0: Con `export default pageConfig`
```ts
// src/blog/[slug]/page_functions.ts
import type { PageFunctions } from "dinou";

interface BlogProps {
  post: { title: string; content: string };
}

const pageConfig: PageFunctions<"/blog/[slug]", BlogProps> = {
  ppr: true,
  revalidate: 60,
  allowISG: true,
  getStaticPaths: ["introduccion", "novedades-v7"],
  validateParams: (params) => Boolean(params?.slug),
  getCacheTags: (params) => ["blog", `post-${params?.slug}`],
  getProps: async (params) => {
    const post = await fetchPost(params.slug);
    return { post };
  },
};

export default pageConfig;
```

---

## 4. Ventajas Clave desde el Punto de Vista del Usuario y TypeScript

### 1. Inferencia de Tipos en Cascada (Single Point of Truth)
Al tipar la constante con `PageFunctions<"/blog/[slug]", BlogProps>` (o pasando la interfaz de parámetros directamente `PageFunctions<BlogParams, BlogProps>`):
- El tipo de `params` se propaga **automáticamente** a:
  - `getProps(params)`
  - `validateParams(params)`
  - `getCacheTags(params)`
  - `getStaticPaths()`
- El tipo de retorno de `getProps` queda validado contra `BlogProps`.
- **Cero repetición:** No hace falta importar `RouteParams` ni repetir la firma `(params: BlogParams)` en cada una de las 4 funciones.

### 2. Autocompletado y Descubrimiento Total en el IDE
Al abrir las llaves del objeto y pulsar `Ctrl + Espacio`:
- El IDE muestra la lista exhaustiva de todos los contratos reconocidos por Dinou:
  - `ppr`
  - `revalidate`
  - `getStaticPaths`
  - `allowISG`
  - `validateParams`
  - `getCacheTags`
  - `getProps`
- Previene errores tipográficos comunes (por ejemplo, escribir `getcachetags` o `getStaticParam`).
- El tipado estricto rechaza cualquier propiedad ajena o mal escrita.

### 3. Dualidad Valor / Función en los Contratos
El objeto de configuración respeta la filosofía de dualidad de Dinou v7.0+:
- `ppr`: `true` | `false` | `() => boolean` | `async () => Promise<boolean>`
- `revalidate`: `number` (segundos ISR) | `false` (cache eterno) | `0` (dinámico SSR) | función sync/async
- `allowISG`: `boolean` | función sync/async
- `getCacheTags`: array `string[]` | `(params) => string[]` | `async (params) => Promise<string[]>`
- `getStaticPaths`: array directo | función generadora sync/async

### 4. Cohesión e Idiomática Moderna en JS/TS
Sigue el patrón de configuración estándar adoptado en todo el ecosistema web moderno (`vite.config.ts`, `playwright.config.ts`, Astro, TanStack Router). Trata a la configuración de la ruta como una entidad estructurada, en lugar de un conjunto disperso de variables globales.

### 5. Composición y Funciones de Orden Superior (Higher-Order Configs)
Al ser un objeto estándar de JavaScript, se pueden crear utilidades reutilizables para aplicar políticas compartidas entre múltiples páginas:

```ts
// src/utils/route-helpers.ts
import type { PageFunctions } from "dinou";

export function withProtectedCache<TParams, TProps>(
  config: PageFunctions<TParams, TProps>
): PageFunctions<TParams, TProps> {
  return {
    ...config,
    revalidate: process.env.NODE_ENV === "production" ? 120 : 0,
    getCacheTags: (params) => [
      "tenant-global",
      ...(typeof config.getCacheTags === "function" ? config.getCacheTags(params) : config.getCacheTags || [])
    ],
  };
}
```
```ts
// src/dashboard/page_functions.ts
import { withProtectedCache } from "@/utils/route-helpers";

export default withProtectedCache({
  getProps: async () => ({ stats: await fetchStats() }),
});
```
> *Nota: Esta composición en bloque es virtualmente imposible con variables individuales exportadas por separado.*

### 6. Encapsulación y Funciones Auxiliares Privadas
En archivos complejos de `page_functions.ts`, es común tener clientes de base de datos, constantes locales o funciones auxiliares (ej. `function formatSlug(...)`). Con `export default pageConfig`, todo lo que no esté explícitamente dentro del objeto queda encapsulado como privado del módulo, sin riesgo de colisiones ni lecturas accidentales por parte del framework.

---

## 5. Precedencia y Sobrescritura: Coexistencia de `default` con `named exports`

Una de las decisiones arquitectónicas clave de Dinou v7.1.0 es la **coexistencia armónica** entre ambos modelos. No se trata de elegir exclusivamente uno u otro; pueden combinarse en el mismo archivo.

### Regla de Resolución de Dinou:
> **Los *Named Exports* tienen prioridad absoluta sobre el *Default Export*.**
>
> Al resolver cada contrato individual (`revalidate`, `ppr`, `getProps`, `validateParams`, `allowISG`, `getStaticPaths`, `getCacheTags`), Dinou comprueba primero si existe la exportación nombrada. Si no existe, acude a la propiedad del objeto `default`.

### Caso de Uso 1: Sobreescribir contratos de un `baseConfig`
Permite importar configuraciones base comunes para una sección o tipo de página, exportarlas como `default` y **sobreescribir puntualmente una directiva** mediante un named export:

```ts
// src/blog/[slug]/page_functions.ts
import baseBlogConfig from "@/config/base-blog.config";

// Exportamos toda la configuración común (getProps, validateParams, getStaticPaths, etc.)
export default baseBlogConfig;

// ⚡ Sobrescritura específica para esta ruta:
// Mientras que baseBlogConfig tenía revalidate = 3600 (ISR),
// esta ruta necesita renderizado dinámico en tiempo real:
export const revalidate = 0;
```

### Caso de Uso 2: Añadir contratos adicionales a un `pageConfig`
Puedes definir las directivas estáticas en el objeto y exportar contratos que requieran dependencias independientes como named exports:

```ts
// src/products/[id]/page_functions.ts
import type { PageFunctions } from "dinou";

const pageConfig: PageFunctions<"/products/[id]"> = {
  ppr: true,
  revalidate: 60,
  allowISG: true,
};

export default pageConfig;

// Añadimos getProps de forma nombrada:
export const getProps = async (params) => {
  const product = await fetchProduct(params.id);
  return { product };
};
```

---

## 6. Flexibilidad de Genéricos en `PageFunctions` y `LayoutFunctions`

La signatura formal del tipo en Dinou es:
```ts
export type PageFunctions<TRouteOrParams = any, TProps = any> = RouteSegmentConfig<...>;
export type LayoutFunctions<TRouteOrParams = any, TProps = any> = RouteSegmentConfig<...>;
```

Ambos parámetros de tipo son **completamente opcionales** (con valor por defecto `any`), adaptándose a las necesidades de cada ruta sin obligar al desarrollador a declarar tipos innecesarios:

### 1. Sin Parámetros Genéricos (`PageFunctions` / `LayoutFunctions`)
Si la página o layout solo necesita declarar directivas de segmento (como `ppr`, `revalidate` o `allowISG`) y no hay validación de parámetros dinámicos ni `getProps`:

```ts
// src/about/page_functions.ts
import type { PageFunctions } from "dinou";

// ✅ Cero genéricos necesarios
const pageConfig: PageFunctions = {
  ppr: true,
  revalidate: 86400, // Cache de 24h
};

export default pageConfig;
```

### 2. Solo Primer Genérico: Ruta Dinámica sin `getProps` (`PageFunctions<TRoute>`)
Cuando la ruta tiene parámetros dinámicos que se usan en `validateParams`, `getCacheTags` o `getStaticPaths`, pero **no se implementa `getProps`** (por ejemplo, porque los datos se leen directamente en el Server Component `page.tsx`):

```ts
// src/docs/[section]/[slug]/page_functions.ts
import type { PageFunctions } from "dinou";

// ✅ Solo pasamos la ruta para inferir { section: string; slug: string }
const pageConfig: PageFunctions<"/docs/[section]/[slug]"> = {
  revalidate: 3600,
  validateParams: (params) => params.section === "guides",
  getCacheTags: (params) => ["docs", params.section],
  getStaticPaths: [
    { section: "guides", slug: "introduccion" },
    { section: "guides", slug: "instalacion" },
  ],
};

export default pageConfig;
```

### 3. Ambos Genéricos: Ruta Dinámica con `getProps` tipado (`PageFunctions<TRoute, TProps>`)
Cuando se implementa `getProps` y se desea que TypeScript verifique tanto la entrada de `params` como la estructura exacta del valor retornado:

```ts
// src/shop/[id]/page_functions.ts
import type { PageFunctions } from "dinou";

interface ShopProps {
  item: { id: string; name: string; price: number };
}

// ✅ Tipado exhaustivo: params inferidos y retorno de getProps validado
const pageConfig: PageFunctions<"/shop/[id]", ShopProps> = {
  getProps: async (params) => {
    const item = await fetchItem(params.id);
    return { item }; // TypeScript comprueba que coincide con ShopProps
  },
};

export default pageConfig;
```

### 4. Paso de Interfaz Directa de Parámetros
En lugar de pasar un string de ruta (`"/ruta/[param]"`), también se puede pasar directamente una interfaz propia:
```ts
interface CustomParams {
  category: string;
}

const pageConfig: PageFunctions<CustomParams> = {
  validateParams: (params) => params.category !== "drafts",
};
```

---

## 7. Aplicabilidad en `layout_functions`

Todo lo anterior aplica de forma 100% idéntica a `layout_functions.ts` usando el tipo `LayoutFunctions`:

```ts
// src/admin/layout_functions.ts
import type { LayoutFunctions } from "dinou";

interface AdminLayoutProps {
  userSession: { role: string; email: string };
}

const layoutConfig: LayoutFunctions<"/admin/[...rest]", AdminLayoutProps> = {
  ppr: true,
  revalidate: 0, // Admin siempre dinámico
  getProps: async (params) => {
    const session = await getAdminSession();
    return { userSession: session };
  },
};

export default layoutConfig;
```

---

## 8. Cuadro Guía para Documentación Oficial (`dinou-docs`)

| Criterio | Named Exports (`export const ...`) | Default Export (`export default pageConfig`) | Híbrido (`default` + `named`) |
| :--- | :--- | :--- | :--- |
| **Estilo Mental** | Convención estilo Next.js App Router | Convención estilo Config / Vite / Astro | `baseConfig` con sobrescrituras locales |
| **Inferencia de TypeScript** | Manual por cada función individual | Centralizada en un único genérico (`PageFunctions`) | Centralizada con overrides puntuales |
| **Descubrimiento (Autocomplete)** | Requiere conocer los nombres de memoria | `Ctrl + Espacio` sobre las llaves del objeto | Autocomplete sobre el objeto base |
| **Precedencia en Dinou** | **Alta** (sobreescribe al default) | **Base** (fallback si no hay named) | El `named` gana contrato por contrato |
| **Composición (Middlewares)** | Difícil / boilerplate por cada export | Natural (funciones que reciben y devuelven `config`) | Posible combinando wrapper + named override |
| **Riesgo de Desincronización** | N/A | Cero (no hay pasos intermedios de destructuring) | Cero |
| **Compatibilidad Dinou** | $\ge$ v1.0.0 | $\ge$ v7.1.0 | $\ge$ v7.1.0 |

