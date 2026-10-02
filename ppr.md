# Especificación Técnica de Partial Prerendering (PPR) en Dinou v7.2

> **Documento de Diseño Arquitectónico y Guía de Implementación**  
> *Autor:* Dinou Core Team & Antigravity  
> *Fecha:* Octubre 2026  
> *Estado:* Especificación Completa · Listo para desarrollo en nueva sesión  

---

## 1. Visión y Objetivos

**Partial Prerendering (PPR)** es la cúspide de la renderización moderna en aplicaciones React fullstack. Su objetivo es eliminar el dilema clásico entre **Static Site Generation (SSG)** y **Server-Side Rendering (SSR)**:

* **Antes de PPR:** O bien la ruta completa era estática (incompatible con cookies, auth, datos de usuario en tiempo real), o bien era dinámica con SSR (retrasando el TTFB por consultas a base de datos antes de enviar el primer byte).
* **Con PPR en Dinou:** La página entrega **inmediatamente (0ms TTFB)** una carcasa estática pre-renderizada en tiempo de compilación (Layouts, menús, esqueletos Suspense, contenido estático), mientras que los huecos dinámicos dentro de `<Suspense>` se resuelven en runtime y se transmiten por streaming a través de la misma conexión HTTP.

```
Petición entrante GET /dashboard
       │
       ├─► [0ms TTFB] Entrega Shell Estático desde Edge Storage / CDN
       │   (Navbar, Sidebar, Layout, Skeletons de Suspense)
       │
       └─► [Streaming en paralelo] Servidor evalúa componentes dinámicos en runtime
           ├─► Resuelve <UserProfile /> (lee cookie de sesión)
           ├─► Resuelve <LiveFeed /> (consulta DB en tiempo real)
           └─► Empuja chunks RSC + HTML chunks reemplazando los esqueletos
```

---

## 2. Base Arquitectónica Consolidada en Dinou (Estado Actual)

Dinou cuenta con todos los cimientos necesarios ya testeados y verificados al 100%:

1. **Dual-Bundle Engine (0-fork):**
   - **Pass A (RSC Engine):** Evalúa Server Components bajo condiciones `react-server`.
   - **Pass B (SSR Engine):** Renderiza HTML en streaming a partir de los elementos del cliente.
   - **Pass C (Orchestrator):** Empaqueta para Node, Cloudflare Workers, Deno y Bun.

2. **Segmentación Horizontal:**
   - Rutas desacopladas entre Layout (`/____rsc_layout____`) y Página (`/____rsc_page____`).
   - El router preserva el estado de layouts y componentes cliente durante navegaciones SPA.

3. **Segmentación Vertical (Micro-ISR con `DinouCacheSlot`):**
   - Primitiva `<DinouCacheSlot id="..." tag="..." revalidate={...}>` implementada para granularidad por componente.
   - Soporte para revalidación en segundo plano (SWR) y refresco en vivo desde cliente (`refreshSlot`).

4. **Almacenamiento Conectivo (`StorageAdapter`):**
   - Abstracción única para `FileSystemStorage` (Node/Netlify/Docker), `CloudflareKVStorage` (Edge Workers), `DenoKVStorage` (Deno Deploy) y `MemoryStorage`.

---

## 3. Mecánica de PPR en Dinou

### 3.1. Declaración en Rutas
Una ruta habilita PPR exportando la constante de configuración:

```tsx
// src/dashboard/page.tsx
import { Suspense } from "react";
import { UserProfile, LiveFeed, DashboardHeader } from "./components";

export const experimental_ppr = true; // o export const ppr = true;

export default async function DashboardPage() {
  return (
    <main>
      {/* 1. Parte Estática: Pre-renderizada en build */}
      <DashboardHeader />

      {/* 2. Hueco Dinámico A: Dependiente de sesión */}
      <Suspense fallback={<div className="skeleton-user">Cargando usuario...</div>}>
        <UserProfile />
      </Suspense>

      {/* 3. Hueco Dinámico B: Datos en tiempo real */}
      <Suspense fallback={<div className="skeleton-feed">Cargando actividad...</div>}>
        <LiveFeed />
      </Suspense>
    </main>
  );
}
```

### 3.2. Proceso en Build Time (Static Shell Generation)
Durante `npm run build`:
1. El compilador detecta `ppr: true` / `experimental_ppr: true`.
2. Se ejecuta un render especial de pre-renderizado:
   - Se interceptan las fronteras `<Suspense>`.
   - Si un componente dentro de `<Suspense>` intenta acceder a primitivas dinámicas (`cookies()`, `headers()`, `searchParams` o lanza un postponement), el compilador detiene la evaluación de ese sub-árbol y renderiza su `fallback`.
3. Se generan y guardan en el Storage (`dist2` o Cloudflare/Deno KV):
   - `shell.html`: HTML que contiene el layout y los fallbacks de Suspense con identificadores de sustitución (`data-ppr-hole="hole-id"`).
   - `shell.rsc`: El payload RSC de la parte estática, con marcadores de promesa aplazada en las ranuras de Suspense.
   - `metadata.json`: Marcado con `"ppr": true`, lista de `holes` y configuración de revalidación.

### 3.3. Proceso en Runtime (Streaming Resume)
Cuando un usuario visita la URL en runtime:
1. **Fase Shell Inmediata:**  
   El handler (`dinou/core/handler.js`) detecta `"ppr": true` en los metadatos de la ruta:
   - Envía inmediatamente el `shell.html` con cabeceras `Transfer-Encoding: chunked` (o Web Stream en Cloudflare/Deno/Bun).
   - El navegador pinta el contenido estático y los esqueletos al instante (0ms TTFB).
2. **Fase Streaming Dinámica:**  
   En la misma conexión HTTP abierta:
   - Se evalúan los componentes dinámicos pendientes de `<Suspense>` con el contexto real de la petición (cookies, auth, DB).
   - Se transmiten los bloques HTML diferidos acompañados del script de reemplazo React 19 (`$RC` / template injection).
   - Se transmite el stream RSC correspondiente para la hidratación y transiciones SPA.
   - Se cierra la conexión (`stream.close()`).

---

## 4. Plan de Implementación Paso a Paso para la Nueva Sesión

### Paso 1: Primitiva de Detección y Marcado PPR
* Modificar [dinou/core/route-generator.js](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/route-generator.js) y [dinou/core/parse-exports.js](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/parse-exports.js) para detectar `export const experimental_ppr = true` o `export const ppr = true`.
* Añadir la propiedad `ppr: boolean` en el manifiesto de rutas.

### Paso 2: Generación del Shell Estático en Build Time
* Extender [dinou/core/build-static-pages.js](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/build-static-pages.js) y [dinou/core/generate-static-page.js](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/generate-static-page.js):
  - Cuando una ruta tenga `ppr: true`, renderizar el árbol RSC utilizando `prerender` / captura de Suspense.
  - Almacenar el HTML inicial del shell y el payload RSC estático.

### Paso 3: Motor de Streaming Dual en Runtime (`handler.js`)
* En [dinou/core/handler.js](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/handler.js):
  - Si la ruta es PPR y se solicita navegación tradicional (`text/html`):
    - Flujo 1: Enviar de inmediato el Shell estático.
    - Flujo 2: En paralelo, iniciar el stream de renderizado de los huecos dinámicos e inyectarlos por el mismo stream de respuesta HTTP.
  - Si la ruta se solicita como navegación SPA (`rsc=1` o `____rsc_page____`):
    - Servir el stream RSC combinado (shell estático reanudado con los chunks dinámicos en vivo).

### Paso 4: Pruebas E2E en Playwright
* Crear `src/t-ppr/` con una página demo:
  - Header estático con timestamp fijo de build.
  - `<Suspense>` con `SlowDynamicComponent` (acceso a cookies o `new Promise(r => setTimeout(r, 1000))`).
* Crear suite de tests en [e2e/example.spec.ts](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/e2e/example.spec.ts):
  1. Verificar que el shell estático y el esqueleto se reciben de inmediato (<50ms).
  2. Verificar que tras completarse el stream, el contenido dinámico reemplaza al fallback de Suspense sin parpadeo.
  3. Verificar que las transiciones cliente hidratan correctamente ambos segmentos.

---

## 5. Archivos Clave a Consultar en la Nueva Sesión

* [dinou/core/handler.js](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/handler.js): Orquestación central de peticiones y streaming.
* [dinou/core/rsc-renderer.js](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/rsc-renderer.js): Renderizador universal de streams (Node vs Web Streams).
* [dinou/core/build-static-pages.js](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/build-static-pages.js): Compilador estático de páginas.
* [dinou/core/generate-static-page.js](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/generate-static-page.js): Renderizador de HTML estático y extracción de metadatos.
* [dinou/core/cache-slot.js](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/cache-slot.js): Primitiva de serialización/deserialización JSX React 19 y caching granular.
* [dinou/core/storage-adapter.js](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/storage-adapter.js): Adaptador unificado de almacenamiento.
