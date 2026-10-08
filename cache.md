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

### 2.2. On-Demand Path Revalidation (`revalidatePath`)

Exportada desde `"dinou/server"`, se utiliza típicamente dentro de **Server Actions** o **Route Handlers** tras mutaciones de datos:

```typescript
import { revalidatePath } from "dinou/server";

export async function updateProduct(id: string, data: any) {
  await db.product.update({ where: { id }, data });
  
  // Fuerza la regeneración estática inmediata de la ruta
  await revalidatePath(`/productos/${id}`);
}
```

#### Mecánica Interna:
1. En **Node / Bun (Filesystem):**
   * Copia los artefactos actuales a `page._old.rsc`, `layout._old.rsc` e `index._old.html`.
   * Re-ejecuta `getBuildStaticPage()` y `getGenerateStaticRSC()`.
   * Realiza un renombrado seguro atómico (`safeRename`) sobre `.dinou/dist2/`.
2. En **Edge Runtime (Cloudflare Workers / Deno KV):**
   * Actualiza el valor en el almacenamiento KV con nuevo `generatedAt = Date.now()`.

---

### 2.3. On-Demand Tag Revalidation (`revalidateTag`)

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

Dinou examina recursivamente los archivos `metadata.json`, `layout.metadata.json` y `slot.metadata.json` en disco o las claves de metadatos en KV Storage, disparando la revalidación de todas las coincidencias.

---

### 2.4. Segmentación Vertical: Micro-ISR con `<DinouCacheSlot>`

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

### 3.1. `pageCache` (La Memoria de la Pestaña)
```javascript
const pageCache = new Map(); // url -> Promise<RSCPayload>
```
Cuando un usuario hace clic en `<Link href="/dashboard">`:
* Si `/dashboard` ya se visitó en esa misma sesión, se recupera directamente de `pageCache`.
* No se realiza ninguna llamada de red (latencia 0ms).

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

<button onClick={() => router.refresh()}>
  Refrescar
</button>
```

* **Qué hace:**
  1. Borra la ruta actual del caché cliente: `pageCache.delete(currentPath)`.
  2. Dispara `startTransition(() => setVersion(v => v + 1))`.
  3. Solicita de nuevo el payload de la página actual al servidor.
  4. Reconcilia el árbol de componentes React **preservando el estado cliente intacto** (texto escrito en inputs, foco, estados de `useState`, scroll).
* **Qué NO hace:** **NO** fuerza a que una página estática se convierta en dinámica en el servidor.
* **Comportamiento según el entorno:**
  * **En Desarrollo:** Todas las rutas son dinámicas; `refresh()` siempre refleja cambios del código o datos.
  * **En Producción:**
    * Si la ruta es **dinámica** (`revalidate = 0`): Refresca con los datos más recientes del servidor.
    * Si la ruta es **estática** (SSG): El servidor devuelve el mismo payload estático ya generado (o el revalidado si expiró el tiempo de ISR o se usó `revalidatePath`). El estado de los inputs y componentes cliente se preserva sin recarga de página.

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
| **`revalidatePath(path)`** | Servidor | Server Action / Endpoint | **Sí** (inmediato) | No directo | N/A |
| **`revalidateTag(tag)`** | Servidor | Server Action / Endpoint | **Sí** (selectivo) | No directo | N/A |
| **`<Link href="...">`** | Cliente | JSX | No | No (usa `pageCache`) | Sí (Soft Nav) |
| **`<Link href="..." fresh>`** | Cliente | JSX | No | **Sí** (`pageCache.delete`) | No (nueva página) |
| **`router.refresh()`** | Cliente | Hook `useRouter()` | No | **Sí** (`pageCache.delete`) | **Sí** (mantiene inputs/foco) |
| **`router.refreshSlot(id)`** | Cliente | Hook `useRouter()` | No | **Sí** (solo el slot) | **Sí** (el resto de la página no cambia) |
