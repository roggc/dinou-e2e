# Arquitectura de Caché e Invalidación en Dinou v7.2

> **Documento de Diseño Arquitectónico y Guía de Referencia**  
> *Ámbito:* Dinou Core Engine, Edge/Node Runtime y Router Cliente  
> *Fecha:* Octubre 2026  

---

## 1. Visión General: Los Dos Niveles de Caché

Dinou separa estrictamente la caché en **dos niveles desacoplados**:

1. **Nivel Servidor (Persistencia y Artefactos):** Controla qué páginas, layouts o fragmentos se pre-renderizan a disco (`.dinou/dist2/`) o almacén KV (Cloudflare Workers, Deno KV), y cómo se revalidan mediante Incremental Static Regeneration (ISR).
2. **Nivel Cliente (Router SPA en Memoria):** Controla las promesas de React Server Components (RSC) almacenadas en la memoria de la pestaña del navegador para garantizar navegaciones instantáneas (0ms de red) y reconciliación sin perder estado.

```
                              NAVEGADOR (Cliente)
 ┌────────────────────────────────────────────────────────────────────────┐
 │                                                                        │
 │   Acción del Usuario:                                                  │
 │   - <Link href="/blog">          ──► Usa pageCache en memoria (0ms)   │
 │   - <Link href="/blog" fresh>    ──► pageCache.delete() ─┐            │
 │   - router.refresh()             ──► pageCache.delete() ─┼──┐         │
 │                                                          │  │         │
 └──────────────────────────────────────────────────────────┼──┼──────────┘
                                                            │  │
                                   Petición de Red HTTP     ▼  ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                                                                        │
 │                    SERVIDOR DINOU (Node / Edge / Bun)                  │
 │                                                                        │
 │   1. ¿La ruta tiene revalidate = 0 o es dinámica?                      │
 │      ├─► SÍ ──► Evalúa componente en vivo (SSR dinámico)               │
 │      │                                                                 │
 │      └─► NO (Es estática SSG o ISG no expirada)                        │
 │           ├─► ¿Expiró revalidate = N (ISR)?                            │
 │           │   ├─► SÍ ──► Sirve versión actual + regenera en background │
 │           │   └─► NO ──► Sirve .rsc estático desde disco/KV            │
 │           │                                                            │
 │           └─► ¿Se llamó revalidatePath() o revalidateTag()?            │
 │               └─► Invalida y regenera el artefacto estático en disco/KV│
 └────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Nivel Servidor: Persistencia y Revalidación (ISR)

El servidor gestiona la generación estática de páginas (`page.rsc`, `index.html`) y layouts (`layout.rsc`).

### 2.1. Time-Based ISR (`revalidate`)
Se declara en `page_functions.ts` o `layout_functions.ts`:

```typescript
// src/productos/page_functions.ts
export const revalidate = 60; // 60 segundos (ISR)
// o alternativamente:
// export const revalidate = 0;     // 100% Dinámico (SSR puro)
// export const revalidate = false; // 100% Estático (SSG hasta revalidación manual)
```

* **`revalidate >= 1` (Time-Based ISR):**
  * La página se pre-genera en compilación o en la primera visita (ISG).
  * Junto al artefacto se guarda `metadata.json` con la marca de tiempo `generatedAt`.
  * Si `Date.now() > generatedAt + (revalidate * 1000)`:
    * Se sirve de forma inmediata la versión existente (*stale*).
    * En segundo plano se ejecuta la regeneración (`getBuildStaticPage()` y `getGenerateStaticRSC()`).
    * Al terminar, el nuevo archivo `.rsc` y `.html` reemplaza al anterior de manera atómica (mediante `safeRename`), guardando el previo como `._old.rsc` para peticiones en vuelo.
* **`revalidate = 0` (Dinámico Puro):**
  * Dinou detecta `isDynamicConfig = true`.
  * En `dinou/core/handler.js`, se marca `dynamicState.value = true`, lo que anula de raíz la búsqueda en caché estática. La página siempre ejecuta el componente React en el servidor.
* **`revalidate = false` (o ausente):**
  * Se considera estática indefinidamente (SSG puro) hasta que se invoque una revalidación bajo demanda.

---

### 2.2. Revalidación Quirúrgica de Página (`revalidatePage`)

Exportada desde `"dinou/server"`, se utiliza cuando únicamente ha cambiado el contenido propio de una página y se desea revalidarla sin incurrir en costes de recompilación de layouts:

```typescript
import { revalidatePage } from "dinou/server";

export async function updateArticle(slug: string) {
  // Regenera únicamente page.rsc y su index.html
  await revalidatePage(`/blog/${slug}`);
}
```

* **Qué hace:**
  1. Regenera **`page.rsc`**.
  2. Regenera **`index.html`** para esa página.
  3. **No toca ningún `layout.rsc`**, ahorrando CPU en layouts pesados o compartidos.
  4. En Edge Runtime (Cloudflare KV / Deno KV): actualiza de forma inmediata las claves `page.rsc` e `index.html`.

---

### 2.3. Revalidación de Segmento y Cascada (`revalidatePath`)

Exportada desde `"dinou/server"`, es el método integral de ruta. Revalida todos los elementos presentes en esa carpeta específica:

```typescript
import { revalidatePath } from "dinou/server";

// 1. Revalidación estándar del segmento
await revalidatePath("/dashboard");

// 2. Revalidación con Cascada (propaga a todas las páginas hijas)
await revalidatePath("/dashboard", { cascade: true });
```

#### Artefactos Afectados en `revalidatePath(path)`:
* **Página (`page.rsc`):** Se regenera si existe en esa carpeta.
* **Layout del segmento (`layout.rsc`):** Si en esa misma carpeta existe un `layout.tsx`, se regenera de forma atómica tanto en Node como en Cloudflare KV (paridad 100%).
* **HTML Completo (`index.html`):** Se re-evalúa el render estático completo (`getGenerateStaticPage()`).

#### Revalidación en Cascada: `{ cascade: true }`
Cuando se pasa `{ cascade: true }`:
1. Dinou revalida la ruta actual `/dashboard` (`layout.rsc`, `page.rsc` e `index.html`).
2. **Condición de seguridad:** La cascada **solo se activa si en esa ruta existe un layout que haya sido revalidado**. Si en la ruta no hay layout, no hay nada compartido que propagar y no se ejecuta ninguna cascada innecesaria.
3. **Propagación:** Si se revalidó un layout, Dinou recorre recursivamente todas las subcarpetas hijas (`/dashboard/analytics`, `/dashboard/settings`, etc.) y ejecuta internamente **`revalidatePage(childPath)`** en cada una.

> **¿Qué problema resuelve `{ cascade: true }`?**  
> Elimina de raíz el peligro del **Hydration Mismatch** en recargas duras (F5 o acceso directo por URL). Al actualizar un layout padre y propagar la cascada a todas las páginas hijas, sus archivos estáticos `index.html` quedan horneados con el nuevo layout, garantizando coincidencia total con el stream RSC y 0 parpadeos visuales.

---

### 2.4. On-Demand Tag Revalidation (`revalidateTag`)

Permite asociar etiquetas a páginas, layouts o fragmentos y purgarlas de forma transversal:

```typescript
// src/productos/[slug]/page_functions.ts
export const getCacheTags = ["catalog", "products"];
```

Cuando cambia el inventario:
```typescript
import { revalidateTag } from "dinou/server";

export async function syncInventory() {
  await revalidateTag("products"); // Invalida todas las rutas con este tag
}
```

#### ¿Cómo opera internamente `revalidateTag(tag)`?
Dinou busca de forma recursiva todos los archivos de metadatos asociados a la etiqueta solicitada y ejecuta una acción específica según el tipo de componente:

1. **Si el tag se declaró en `layout_functions.ts`:**
   * El tag se almacena en `layout.metadata.json`.
   * **Por defecto (`revalidateTag(tag)`):** Dinou ejecuta internamente **`revalidateLayout(path)`**.
     * **Alcance:** Regenera **exclusivamente `layout.rsc`**.  
     * **Ventaja:** No toca `page.rsc` ni `index.html`, ofreciendo una revalidación ultra-rápida (50ms) y de mínimo coste de CPU para actualizar únicamente el cascarón (shell) en navegaciones SPA, protegiendo al servidor de avalanchas de CPU en catálogos masivos.
     * **Riesgo conocido de Hydration Mismatch:** Al no tocar `index.html`, una recarga dura (F5 o entrada directa por URL) servirá el HTML estático previo con el layout anterior, produciendo un potencial *Hydration Mismatch* contra el nuevo `layout.rsc`.
   * **Con cascada (`revalidateTag(tag, { cascade: true })`):** Dinou ejecuta internamente **`revalidatePath(path, { cascade: true })`**.
     * **Alcance:** Regenera `layout.rsc` y propaga `revalidatePage` a todas las páginas hijas para hornear el nuevo layout dentro de sus `index.html`.
     * **Ventaja:** Elimina el riesgo y garantiza **0 Hydration Mismatch** en recargas duras (F5) en módulos acotados (ej. `/dashboard`).
2. **Si el tag se declaró en `page_functions.ts`:**
   * El tag se almacena en `metadata.json`.
   * Dinou ejecuta internamente **`revalidatePage(path)`**.
   * **Alcance:** Regenera **exclusivamente `page.rsc`** e **`index.html`**.  
   * **Ventaja:** No toca `layout.rsc` (incluso si la página comparte directorio con un `layout.tsx`), garantizando una revalidación quirúrgica simétrica a la de los layouts y evitando desperdicio de CPU.
3. **Si el tag se declaró en un `<DinouCacheSlot>`:**
   * El tag se almacena en `slot.metadata.json`.
   * Dinou purga únicamente el directorio o clave del slot en cuestión.

---

#### Paridad Total entre Runtimes: Node/Bun (Filesystem) vs Cloudflare Workers / Edge (KV Storage)

Dinou garantiza un comportamiento 100% isomórfico entre entornos con sistema de archivos (Node.js / Bun) y entornos Edge serverless con almacenamiento clave-valor (Cloudflare KV / Deno KV):

* **`revalidatePage(path)`:** En ambos entornos regenera únicamente `page.rsc` e `index.html`.
* **`revalidatePath(path)`:** En ambos entornos regenera `page.rsc`, `index.html` y **`layout.rsc`** (si en esa carpeta existe layout). En Edge KV, Dinou comprueba la existencia de la clave `layout.rsc` / `layout.metadata.json` para dicho segmento y dispara `revalidateLayout` de forma coordinada.
* **`revalidatePath(path, { cascade: true })`:** En ambos entornos propaga en cascada `revalidatePage` a todas las rutas hijas si se revalidó un layout.
* **`revalidateTag(tag, options)`:** 
  * Si el tag está en un layout (`layout_functions.ts`):
    * Por defecto regenera únicamente `layout.rsc`.
    * Con `{ cascade: true }`, regenera `layout.rsc` y propaga en cascada `revalidatePage` a todas las páginas hijas vía `revalidatePath(path, { cascade: true })`.
  * Si el tag está en una página (`page_functions.ts`), regenera exclusivamente `page.rsc` e `index.html` (mediante `revalidatePage`).
  * Si el tag está en un slot (`<DinouCacheSlot>`), purga únicamente dicho fragmento.

#### Regla de Oro y Buenas Prácticas de Invalidación:
1. **Invalidación Quirúrgica del Shell:**  
   Declara el tag **únicamente en `layout_functions.ts`** (ej: `["dashboard-shell"]`) y llama a `revalidateTag("dashboard-shell")`. Solo se recompilará el `layout.rsc` para SPA.
2. **Invalidación Quirúrgica de una Página:**  
   Usa `revalidatePage("/ruta")` o declara el tag **únicamente en `page_functions.ts`** de esa página (ej: `["analytics-view"]`). Solo se recompilará esa página concreta y su HTML.
3. **Invalidación de un Módulo Completo (Layout + Hijas):**  
   Usa `revalidatePath("/dashboard", { cascade: true })`, o llama a **`revalidateTag("dashboard", { cascade: true })`**, o declara un tag compartido **tanto en `layout_functions.ts` como en las `page_functions.ts` de las hijas**. De este modo, en cualquier runtime Dinou actualizará de forma atómica el layout padre y todas las páginas e HTMLs del módulo, garantizando 0 Hydration Mismatch.

---

### 2.5. Segmentación Vertical: Micro-ISR con `<DinouCacheSlot>`

Dinou permite granularidad por componente dentro de una página:
```tsx
import { DinouCacheSlot } from "dinou";

<DinouCacheSlot id="panel-noticias" tag="noticias" revalidate={30}>
  <NoticiasEnVivo />
</DinouCacheSlot>
```
* Cada slot almacena su propio payload (`____rsc_slot____/panel-noticias`) y su propio `slot.metadata.json`.
* Puede invalidarse vía servidor con `revalidateTag("noticias")` o desde el cliente con `router.refreshSlot("panel-noticias")` sin re-renderizar la página que lo contiene.

---

## 3. Nivel Cliente: Router SPA y Caché en Memoria

El router de Dinou (`dinou/core/client.jsx`) gestiona una navegación SPA suave y ultrarrápida.

### 3.1. Las Cachés en Memoria del Router (`pageCache` y `layoutCache`)

El router cliente de Dinou mantiene dos estructuras en memoria para lograr navegaciones instantáneas y sin parpadeos:

1. **`pageCache` (Caché de Páginas):**
   ```javascript
   const pageCache = new Map(); // url -> Promise<RSCPayload>
   ```
   * Cuando un usuario navega a una ruta ya visitada (ej. `<Link href="/dashboard">`), se recupera directamente de `pageCache`.
   * **Latencia 0ms:** No se realiza ninguna petición de red al servidor.

2. **`layoutCache` (Preservación de Layouts):**
   ```javascript
   const layoutCache = new Map(); // layoutKey -> Promise<RSCPayload>
   ```
   * Al navegar entre páginas que comparten el mismo layout (por ejemplo, de `/dashboard/analytics` a `/dashboard/settings`), Dinou comprueba si el `layoutKey` (`/dashboard`) ya existe en `layoutCache`.
   * **Beneficio fundamental:** El layout **ni se vuelve a descargar por red ni se re-monta en React**. El estado del sidebar, focus, audio en reproducción o inputs dentro del layout se preservan de forma continua e ininterrumpida.

---

### 3.2. El Prop `<Link fresh>`

```tsx
<Link href="/t-spa-fresh/random" fresh>
  Ver valor fresco
</Link>
```

* **Qué hace:** Ejecuta `pageCache.delete(finalPath)` justo antes de realizar la navegación.
* **Qué NO hace:** **NO** invalida la caché del servidor. No borra archivos en `.dinou/dist2/` ni llama a `revalidatePath`.
* **Propósito:** Indicarle al router cliente: *"No uses la promesa que tienes en memoria de visitas anteriores; haz una petición HTTP real al servidor"*.
* **Comportamiento en destino:**
  * Si la ruta destino es **dinámica** (`revalidate = 0`): El servidor ejecutará el componente y devolverá datos frescos.
  * Si la ruta destino es **estática** (SSG): El servidor devolverá el `.rsc` estático compilado existente.

---

### 3.3. El Método `router.refresh()`

```tsx
const router = useRouter();

// 1. Refresco estándar de página (por defecto)
<button onClick={() => router.refresh()}>
  Refrescar página
</button>

// 2. Refresco con Layout (página + shell del layout)
<button onClick={() => router.refresh({ layout: true })}>
  Refrescar todo (incluye layout)
</button>
```

* **Qué hace por defecto (`router.refresh()`):**
  1. Borra la página actual del caché cliente: `pageCache.delete(currentPath)`.
  2. **Preserva intacto `layoutCache`**: No realiza peticiones innecesarias de layout al servidor (1 sola petición RSC en vez de 2), asegurando máxima velocidad y cero perturbación en el shell del layout (menús desplegados, reproductores, etc.).
  3. Dispara `startTransition(() => setVersion(v => v + 1))`.
  4. Solicita de nuevo el payload fresco de la página actual al servidor.
  5. Reconcilia el árbol de componentes React **preservando el estado cliente intacto** (texto escrito en inputs, foco, estados de `useState`, scroll).
* **Con `{ layout: true }` (`router.refresh({ layout: true })`):**
  1. Borra `pageCache` de la página actual y además purga el layout activo de `layoutCache`.
  2. Dispara `startTransition` incrementando tanto la versión de la página como del layout (`layoutVersion`).
  3. Solicita tanto la página como el layout actualizados al servidor (ideal tras mutaciones globales como cambiar el avatar o la organización activa en el navbar).
* **Qué NO hace:** **NO** fuerza a que una página estática se convierta en dinámica en el servidor.
* **Comportamiento según el entorno:**
  * **En Desarrollo:** Todas las rutas son dinámicas; `refresh()` siempre refleja cambios del código o datos.
  * **En Producción:**
    * Si la ruta es **dinámica** (`revalidate = 0`): Refresca con los datos más recientes del servidor.
    * Si la ruta es **estática** (SSG): El servidor devuelve el mismo payload estático ya generado (o el revalidado si expiró el tiempo de ISR o se usó `revalidatePath` / `revalidatePage`). El estado de los inputs y componentes cliente se preserva sin recarga de página.

---

## 4. Endpoints Internos y el Flag `window.__DINOU_USE_STATIC__`

### 4.1. Familia de Endpoints RSC
Dinou divide las peticiones de componentes en dos canales:

| Endpoint | Tipo | Comportamiento en Servidor |
| :--- | :--- | :--- |
| `/____rsc_page____/*` | Dinámico | Pasa por el pipeline de evaluación React en vivo (`getJSX` ➔ `pipeRSC`). |
| `/____rsc_page_static____/*` | Estático | Lee directamente el archivo binario pre-compilado en disco (`page.rsc`) o ASSETS/KV sin evaluar React. |
| `/____rsc_layout____/*` | Segmentado Dinámico | Evalúa únicamente el layout correspondiente. |
| `/____rsc_layout_static____/*` | Segmentado Estático | Sirve `layout.rsc` desde disco/KV. |

### 4.2. ¿Para qué sirve `window.__DINOU_USE_STATIC__`?
Cuando el usuario entra por primera vez a la aplicación (petición inicial HTML), el servidor inspecciona si esa página concreta se sirve desde caché estática ([`handler.js:1890`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/handler.js#L1890)):

```javascript
if (shouldCacheISG && !isPprConfig) {
  bootstrapScriptContent += "window.__DINOU_USE_STATIC__ = true;\n";
} else {
  bootstrapScriptContent += "window.__DINOU_USE_STATIC__ = false;\n";
}
```

* **Rol en el cliente:** Le indica al router si la aplicación en producción puede solicitar payloads por la vía ultrarrápida `/____rsc_page_static____`.
* **Garantía del servidor:** En el servidor ([`handler.js:1228`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/handler.js#L1228)), Dinou evalúa la configuración de la ruta (`resolvePageFunctionsConfig`) **antes** de decidir si sirve desde caché estática. Si la página declara `revalidate = 0`, el servidor marca `dynamicState.value = true` y fuerza la ejecución dinámica, garantizando que una ruta dinámica jamás sea servida accidentalmente desde un archivo estático.

---

## 5. Matriz Resumen de Estrategias

| Mecanismo | Nivel | ¿Dónde se ejecuta? | ¿Invalida Servidor? | ¿Invalida Cliente? | Preserva Estado Cliente |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **`revalidate = N` (ISR)** | Servidor | Declarativo (`page_functions.ts`) | **Sí** (por tiempo SWR) | No directo | N/A |
| **`revalidatePage(path)`** | Servidor | Server Action / Endpoint | **Sí** (solo página/HTML) | No directo | N/A |
| **`revalidatePath(path)`** | Servidor | Server Action / Endpoint | **Sí** (segmento actual) | No directo | N/A |
| **`revalidatePath(path, { cascade: true })`** | Servidor | Server Action / Endpoint | **Sí** (layout + hijas) | No directo | N/A |
| **`revalidateTag(tag, { cascade? })`** | Servidor | Server Action / Endpoint | **Sí** (selectivo o cascada) | No directo | N/A |
| **`<Link href="...">`** | Cliente | JSX | No | No (usa `pageCache`) | Sí (Soft Nav) |
| **`<Link href="..." fresh>`** | Cliente | JSX | No | **Sí** (`pageCache.delete`) | No (nueva página) |
| **`router.refresh()`** | Cliente | Hook `useRouter()` | No | **Sí** (solo página por defecto; layout con `{layout:true}`) | **Sí** (mantiene inputs/foco) |
| **`router.refreshSlot(id)`** | Cliente | Hook `useRouter()` | No | **Sí** (solo el slot) | **Sí** (el resto de la página no cambia) |
