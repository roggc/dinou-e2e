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

#### Mecánica Interna y Artefactos Afectados:
1. En **Node / Bun (Filesystem):**
   * Copia los artefactos actuales a `page._old.rsc`, `layout._old.rsc` e `index._old.html`.
   * Re-ejecuta `getBuildStaticPage()` y `getGenerateStaticRSC()`.
   * Realiza un renombrado seguro atómico (`safeRename`) sobre `.dinou/dist2/`.
2. En **Edge Runtime (Cloudflare Workers / Deno KV):**
   * Actualiza el valor en el almacenamiento KV con nuevo `generatedAt = Date.now()`.

#### ¿Revalida `page.tsx`, `layout.tsx` o ambos?
`revalidatePath(path)` revalida **ambos elementos cuando coexisten en el mismo segmento de ruta**:

* **Página (`page.rsc`):** Se regenera siempre para el segmento especificado.
* **Layout del segmento (`layout.rsc`):** Si en el mismo directorio de la ruta existe un `layout.tsx`, Dinou comprueba la existencia de `layout.rsc` o `layout._old.rsc` y regenera también su payload RSC de forma atómica.
* **HTML Completo (`index.html`):** Se re-evalúa el render estático completo (`getGenerateStaticPage()`), el cual envuelve la página dentro de todos sus layouts ancestros hasta el Layout Raíz. El archivo HTML final refleja los cambios de la página y de todos sus layouts.

#### Comportamiento con Layouts Ancestros (Padres) y Navegación SPA
Considera la siguiente jerarquía de archivos:
```
src/
  layout.tsx              ──► /layout.rsc (Root Layout compartido)
  dashboard/
    layout.tsx            ──► /dashboard/layout.rsc (Dashboard Layout compartido)
    configuracion/
      page.tsx            ──► /dashboard/configuracion/page.rsc
```

Si ejecutas:
```typescript
await revalidatePath("/dashboard/configuracion");
```

1. **Se revalida:**
   * `/dashboard/configuracion/page.rsc` (payload RSC de la página hoja).
   * `/dashboard/configuracion/index.html` (HTML con todos los layouts embebidos).
2. **NO se regenera innecesariamente:**
   * `/dashboard/layout.rsc` ni `/layout.rsc`.

> **¿Por qué este diseño es el correcto?**  
> En una SPA con React Server Components, los layouts padres son estables y compartidos entre múltiples subrutas. Si cada actualización de una página hoja invalidara el `layout.rsc` padre, el router cliente se vería forzado a re-descargar y re-montar el layout en cada navegación, destruyendo el estado cliente de la barra lateral, reproductores de audio, menús o formularios persistentes.

#### ¿Cómo revalidar un Layout Padre Compartido?
Cuando los datos propios de un layout compartido cambian (por ejemplo, el menú de navegación o el perfil de usuario en el header):

1. **Revalidando la ruta del layout directamente:**
   ```typescript
   await revalidatePath("/dashboard"); // Regenera /dashboard/layout.rsc
   await revalidatePath("/");          // Regenera /layout.rsc (Root Layout)
   ```
2. **Mediante `revalidateTag` (estrategia recomendada):**
   Declara un tag en `layout_functions.ts`:
   ```typescript
   // src/dashboard/layout_functions.ts
   export const getCacheTags = ["dashboard-shell"];
   ```
   E invalídalo cuando proceda:
   ```typescript
   await revalidateTag("dashboard-shell");
   ```
   Dinou detectará que el tag está asociado a `layout.metadata.json` y ejecutará internamente `revalidateLayout("/dashboard")`.

#### Caso Especial: Revalidar una ruta con `layout.tsx` y `page.tsx` que tiene rutas hijas
Si tienes la siguiente estructura de carpetas:
```
src/
  dashboard/
    layout.tsx            ──► /dashboard/layout.rsc (Layout Padre Compartido)
    page.tsx              ──► /dashboard/page.rsc (Página Home del Dashboard)
    analytics/
      page.tsx            ──► /dashboard/analytics/page.rsc (Página Hija)
    settings/
      page.tsx            ──► /dashboard/settings/page.rsc (Página Hija)
```

Y ejecutas:
```typescript
await revalidatePath("/dashboard");
```

**¿Qué ocurre exactamente con las rutas hijas?**
1. **El Layout Padre (`/dashboard/layout.rsc`) SÍ se regenera:**  
   Como `/dashboard` contiene un `layout.tsx`, Dinou detecta la existencia de `dist2/dashboard/layout.rsc` y compila una nueva versión del payload RSC del layout de inmediato.
2. **Impacto Inmediato en Navegación SPA:**  
   En la navegación SPA, el router cliente identifica que las rutas hijas (`/dashboard/analytics`, `/dashboard/settings`) pertenecen al segmento de layout `/dashboard`. Al navegar hacia ellas, el cliente recibe y renderiza el **nuevo layout padre actualizado**, aplicándose a todos los hijos en tiempo real.
3. **HTML Estático de Carga Inicial (`index.html`) de los Hijos y el Riesgo de *Hydration Mismatch*:**  
   * El archivo `dist2/dashboard/index.html` se regenera al instante.
   * Sin embargo, los archivos `index.html` pre-generados de las páginas hijas (`analytics`, `settings`) conservarán el HTML anterior en disco si solo se llamó a `revalidatePath("/dashboard")`.

#### ⚠️ El Peligro del *Hydration Mismatch* en Cargas Directas (F5)
Si el layout cambia (por ejemplo, de `"Versión 1"` a `"Versión 2"`) y solo revalidas `/dashboard`:
1. **En disco:** `dashboard/layout.rsc` tiene `"Versión 2"`, pero `dashboard/analytics/index.html` todavía tiene `"Versión 1"`.
2. **Si el usuario pulsa F5 o entra directo por URL a `/dashboard/analytics`:**
   * El navegador descarga el `index.html` viejo y pinta `"Versión 1"`.
   * El router cliente descarga `dashboard/layout.rsc` con `"Versión 2"` para hidratar la vista.
   * **💥 Hydration Mismatch:** React 19 detecta que el DOM del servidor (`"Versión 1"`) no coincide con el stream RSC del cliente (`"Versión 2"`). Aunque React 19 recupera el error repintando el nodo, se produce un molesto **parpadeo visual (*flicker*)** y advertencias en consola.

#### 🛡️ La Solución Arquitectónica Definitiva: `revalidateTag` Compartido
Para evitar completamente este desfase entre el HTML estático de las hijas y el nuevo layout RSC, la convención recomendada en Dinou es compartir una misma etiqueta entre el layout y todas sus páginas hijas:

```typescript
// src/dashboard/layout_functions.ts
export const getCacheTags = ["dashboard"];

// src/dashboard/analytics/page_functions.ts
export const getCacheTags = ["dashboard"];

// src/dashboard/settings/page_functions.ts
export const getCacheTags = ["dashboard"];
```

Al actualizar el layout, ejecutas:
```typescript
await revalidateTag("dashboard");
```

Dinou ejecutará la regeneración completa y en paralelo:
* `dashboard/layout.rsc` ➔ Nuevo Layout RSC.
* `dashboard/page.rsc` e `index.html` ➔ Página principal y su HTML con el nuevo layout.
* `dashboard/analytics/page.rsc` e `index.html` ➔ Página de Analytics y su HTML con el nuevo layout.
* `dashboard/settings/page.rsc` e `index.html` ➔ Página de Settings y su HTML con el nuevo layout.

👉 **Garantía Total:** Tanto las navegaciones suaves en SPA como las cargas duras (F5 o entrada directa por URL) recibirán exactamente el mismo contenido: **0 Hydration Mismatch y 0 parpadeos.**

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

#### ¿Cómo opera internamente `revalidateTag(tag)`?
Dinou busca de forma recursiva todos los archivos de metadatos asociados a la etiqueta solicitada y ejecuta una acción específica según el tipo de componente:

1. **Si el tag se declaró en `layout_functions.ts`:**
   * El tag se almacena en `layout.metadata.json`.
   * Dinou ejecuta internamente **`revalidateLayout(path)`**.
   * **Alcance:** Regenera **exclusivamente `layout.rsc`**.  
   * **Ventaja:** No toca `page.rsc` ni `index.html`, ofreciendo una revalidación ultra-rápida y de mínimo coste de CPU para actualizar únicamente el cascarón (shell).
2. **Si el tag se declaró en `page_functions.ts`:**
   * El tag se almacena en `metadata.json`.
   * Dinou ejecuta internamente **`revalidatePath(path)`**.
   * **Alcance:** Regenera **`page.rsc`** e **`index.html`**.  
   * Si la página se encuentra en una subcarpeta propia (ej. `/dashboard/analytics`), el layout padre queda totalmente intacto.
3. **Si el tag se declaró en un `<DinouCacheSlot>`:**
   * El tag se almacena en `slot.metadata.json`.
   * Dinou purga únicamente el directorio o clave del slot en cuestión.

---

#### Diferencia Arquitectónica: Node/Bun (Filesystem) vs Cloudflare Workers / Edge (KV Storage)

Existe una sutil diferencia de almacenamiento que conviene tener presente:

* **En Node.js / Bun (Sistema de Archivos):**  
  Cuando un tag de página ejecuta `revalidatePath("/dashboard")`, como en Node `revalidatePath` inspecciona la carpeta física en disco, si en esa misma carpeta coexiste un `layout.tsx`, regenerará tanto `page.rsc`, `index.html` como `layout.rsc`.
* **En Cloudflare Workers / Deno KV (Almacenamiento Clave-Valor):**  
  En KV no hay sistema de archivos jerárquico; cada recurso es un par clave-valor independiente (`dashboard/page.rsc` vs `dashboard/layout.rsc`). Dinou itera las claves y:
  * Si la clave coincide con `layout.metadata.json` ➔ dispara `revalidateLayout`.
  * Si la clave coincide con `metadata.json` ➔ dispara `revalidatePath`.

#### Regla de Oro y Buena Práctica Isomórfica:
Para garantizar que tu aplicación se comporte de manera 100% idéntica y predecible tanto en local con Node como desplegada en Cloudflare Workers o Deno:

1. **Invalidación Quirúrgica del Shell:**  
   Declara el tag **únicamente en `layout_functions.ts`** (ej: `["dashboard-shell"]`). Solo se recompilará el `layout.rsc`.
2. **Invalidación Quirúrgica de una Página:**  
   Declara el tag **únicamente en `page_functions.ts`** de esa página (ej: `["analytics-view"]`). Solo se recompilará esa página concreta y su HTML.
3. **Invalidación de un Módulo Completo (Layout + Hijas):**  
   Declara el tag compartido **tanto en `layout_functions.ts` como en `page_functions.ts`** (ej: `["dashboard"]`). De este modo, en cualquier runtime (Node, Bun o Edge KV) Dinou actualizará de forma atómica el layout padre y todas las páginas e HTMLs del módulo.

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
