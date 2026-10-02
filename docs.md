# Arquitectura Dinou v7: Segmentación, Resiliencia y Estado del Arte (PPR & Cache Slots)

> **Documento Técnico de Arquitectura y Visión de Futuro**  
> *Autor:* Dinou Core Team & Antigravity  
> *Fecha:* Octubre 2026  
> *Estado:* Segmentación Horizontal + `layout_functions` (100% Verificado) · Segmentación Vertical (`DinouCacheSlot` Nivel 1 y Nivel 2 Implementado y Verificado) · PPR en Roadmap Activo ([ppr.md](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/ppr.md))  

---

## 1. Introducción y Contexto Evolutivo

Dinou v7 nació como un framework fullstack basado en React Server Components (RSC) y arquitectura Dual-Bundle (0-fork) con soporte nativo para Node.js, Cloudflare Workers, Deno, Bun y Vercel. 

En sus primeras versiones, la navegación entre rutas funcionaba bajo un modelo **monolítico de página completa**: cada transición cliente solicitaba al servidor el árbol completo de componentes (`<Layout><Page /></Layout>`). Aunque este enfoque era sencillo y robusto para empezar, presentaba limitaciones fundamentales comparado con el estado del arte de la industria (Next.js App Router, Remix v2):
1. **Pérdida de estado en Layouts:** El árbol de Layout se volvía a evaluar en el servidor y a reconciliar en el cliente en cada clic de navegación.
2. **Transferencia innecesaria de bytes:** Rutas con layouts pesados (navbars con menús complejos, sidebars ricos, pies de página) volvían a transmitir el mismo payload una y otra vez.
3. **Acoplamiento de caché e ISR:** El ciclo de vida de los datos (`page_functions`, `revalidate`) estaba atado a la página, impidiendo que los layouts tuvieran su propia estrategia de refresco independiente.

A lo largo de este ciclo de trabajo, hemos transformado Dinou en una arquitectura **Segmentada por Capas**, implementando y verificando con éxito:
- **Segmentación Horizontal:** Desacoplamiento de Layouts (`____rsc_layout____`) y Páginas (`____rsc_page____`).
- **`layout_functions`:** ISR desacoplado, tags e ISG independiente para layouts.
- **Segmentación Vertical (`DinouCacheSlot`):** Micro-ISR a nivel de componente con SWR (Nivel 1) y refresco en vivo desde cliente sin recarga (Nivel 2).
- **Próximo Hito:** Partial Prerendering (PPR), documentado y especificado en [ppr.md](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/ppr.md).

---

## 2. Segmentación Horizontal (Rutas y Layouts) — *Implementada y Verificada*

### 2.1. Arquitectura de Endpoints Desacoplados

La segmentación horizontal divide la aplicación en dos planos independientes:
- **Plano de Layout (`____rsc_layout____`):** Renderiza exclusivamente la carcasa del layout y sus slots paralelos (`@slot`), colocando un marcador dinámico (`<DinouPageSlot />`) donde residirá el contenido hijo.
- **Plano de Página (`____rsc_page____`):** Renderiza exclusivamente el componente hoja de la ruta activa (`<Page />`).

```mermaid
graph TD
    Client[Cliente / Router Dinou]
    
    subgraph "Navegación Suave (Soft Navigation)"
        Client -->|1. ¿Layout en caché? SÍ| LayoutCache[Layout Cache: /dashboard]
        Client -->|2. Petición ligera GET| PageEndpoint["/____rsc_page____/dashboard/analytics"]
    end
    
    subgraph "Servidor Dinou (Dual Engine)"
        PageEndpoint --> PageComp["Page: Analytics"]
        LayoutEndpoint["/____rsc_layout____/dashboard"] --> LayoutComp["Layout: Dashboard + DinouPageSlot"]
    end

    LayoutComp -.-> DinouPageContext
    PageComp -.-> DinouPageContext
    DinouPageContext --> ClientMount["DOM Reconciliado (Layout Intacto, Página Actualizada)"]
```

### 2.2. La Ranura de Página: `DinouPageSlot` y `DinouPageContext`

Para que el layout en el cliente no necesite conocer de antemano qué página se renderizará, creamos el componente cliente `DinouPageSlot` y su contexto `DinouPageContext`:

1. **En el servidor (Generación RSC):**  
   Cuando se procesa una petición de layout (`options.segment === "layout"`), el motor reemplaza el contenido de la página por la referencia de componente cliente `DinouPageSlot`.
2. **En el cliente (Consumo y Reconciliación):**  
   El router envuelve la ejecución en:
   ```jsx
   <DinouPageContext.Provider value={slotContextValue}>
     {layoutPromise ? use(layoutPromise) : use(pagePromise)}
   </DinouPageContext.Provider>
   ```
   `DinouPageSlot` consume este contexto y renderiza el payload de la página (`PageConsumer`) dentro de un `SlotErrorBoundary` dedicado.
3. **Preservación total del estado:**  
   Al navegar entre subrutas que comparten layout (por ejemplo, `/demo/page-a` a `/demo/page-b`), el layout **nunca se desmonta ni se re-ejecuta**. Los reproductores de medios continúan sonando, los acordeones permanecen abiertos y las entradas de texto en sidebars o barras de navegación conservan su valor.

### 2.3. Caché de Layouts Sensible a Query Strings (`searchPart`)

Muchos layouts dinámicos albergan slots paralelos condicionales o componentes que dependen de parámetros de búsqueda (`?tab=profile`, `?slot_crash=true`).  
- **Problema encontrado:** La caché inicial de layouts solo indexaba por `layoutKey` (`/error`), de modo que una navegación suave hacia `/error?slot_crash=true` reutilizaba el layout previo y no notificaba a los slots del cambio de parámetros.
- **Solución implementada:** Se expandió `getLayoutPayload(layoutKey, searchPart)` para que la clave de caché y la petición RSC incorporen `${layoutKey}${searchPart}`. Con esto, cualquier cambio en los query strings que deba afectar al layout se propaga en tiempo real.

---

## 3. Resiliencia, Aislamiento y Manejo de Errores en React 19

Durante las pruebas exhaustivas de la suite e2e en Windows (`npm run dev:esbuild`), descubrimos y resolvimos varias peculiaridades críticas de React 19 y del protocolo de streaming RSC:

### 3.1. Eliminación de Doble Envoltura HTML en SSR de Errores
- **Diagnóstico:** En `get-error-jsx.js`, la función `getErrorJSX` verificaba si la raíz del JSX devuelto era de tipo `"html"`. Al estar activo un layout de ruta (`<Layout><PageError /></Layout>`), el tipo de la raíz era la función `Layout`, no `"html"`. En consecuencia, el servidor envolvía el layout dentro de otro `<html><head><body>...</body></html>`, generando marcado HTML inválido (un `<html>` dentro de otro `<body>`). Esto provocaba fallos catastróficos de hidratación en React 19.
- **Corrección:** Se modificó la condición a:
  ```javascript
  if (!layoutApplied && !hasHtml) {
    // Solo encapsular en <html> si no se aplicó ningún layout previo y el componente no lo trae
  }
  ```
  De este modo, cuando el layout raíz está presente, el error se renderiza limpiamente en su ranura natural (`{children}` o `<DinouPageSlot />`), manteniendo el sidebar, la cabecera y el shell del documento interactivos.

### 3.2. El Comportamiento de `SuspenseException` en React 19
- **Diagnóstico:** Al implementar `SlotErrorRenderer` para cargar dinámicamente el `error.tsx` de una ruta durante un fallo en soft-navigation, envolvimos la llamada `use(errorPromise)` dentro de un bloque tradicional `try / catch`. En React 19, cuando una promesa pasada a `use()` está en estado pendiente, React **lanza una excepción interna de suspensión** (`Suspense Exception`) para interrumpir el renderizado y esperar el flujo de red.
- **Efecto adverso:** Nuestro `catch (e)` interceptaba esa excepción considerándola un error de código, lo que impedía que React suspendiera y caía de inmediato en la pantalla genérica de emergencia (`DefaultDevError`).
- **Ajuste:** Se extrajo la invocación de `use(errorPromise)` fuera del `try/catch`, delegando la captura de la suspensión en un límite nativo:
  ```jsx
  <Suspense fallback={null}>
    <SlotErrorRenderer error={this.state.error} reset={reset} />
  </Suspense>
  ```
  Permitiendo que React 19 complete la fase de espera y renderice la página de error personalizada sin parpadeos.

### 3.3. Reseteo de Error Boundaries sin Destruir el Árbol Sano
- **El reto:** Cuando ocurre un error en el cliente, el `SlotErrorBoundary` debe atraparlo. Al reiniciar la navegación, el boundary debe resetearse sin usar una prop `key` mutante que desmonte los componentes sanos de la página.
- **Arquitectura de dos niveles:**
  1. En condiciones normales (`hasError === false`): `SlotErrorBoundary` permanece montado y retiene la instancia de sus hijos.
  2. En condiciones de error (`hasError === true`): Se detecta cualquier navegación (incluyendo visitas a la misma URL para reiniciar) a través de un contador de navegación (`navCount` y `resetKey: ${route}::${navCount}`). En `componentDidUpdate`:
     ```javascript
     componentDidUpdate(prevProps) {
       if (this.state.hasError && (prevProps.resetKey !== this.props.resetKey || prevProps.pagePromise !== this.props.pagePromise)) {
         this.setState({ hasError: false, error: null });
       }
     }
     ```
  Esto garantiza **100% de persistencia de estado en páginas saludables** y **100% de recuperabilidad inmediata ante errores**.

---

## 4. `layout_functions` para ISR Desacoplado — *Implementado y Verificado*

### 4.1. Necesidad Arquitectónica Resuelta
Anteriormente, la orquestación de caché e ISR en Dinou estaba centralizada en `page_functions`.  
Con la segmentación horizontal, un layout `/tienda/layout.tsx` que contiene un menú de categorías compartido por 50 subpáginas necesitaba poder definir su propio TTL de revalidación y tags de invalidación independientes.

### 4.2. Especificación y Sintaxis Implementada
Se habilitó la declaración de funciones de control a nivel de layout mediante `layout.functions.js` / `layout.functions.ts` o exportaciones con nombre en `layout.tsx`:

```typescript
// src/dashboard/layout.functions.ts
export const revalidate = 3600; // Cachear el layout durante 1 hora
export const tags = ["dashboard-shell", "user-nav"];
export const allowISG = true;
```

### 4.3. Flujo en Servidor y Edge
1. **Resolución:** El manejador ejecuta `resolveLayoutFunctionsConfig(layoutPath, ...)` en paralelo con `resolvePageFunctionsConfig`.
2. **Caché en Storage:** El payload del layout (`layout.rsc`) y sus metadatos (`layout.metadata.json`) se almacenan bajo sus propias etiquetas y TTL en el Storage (`FileSystemStorage`, `CloudflareKVStorage`, `DenoKVStorage`, etc.).
3. **Invalidación selectiva:** Al llamar a `revalidateTag("dashboard-shell")` o `revalidateLayout("/dashboard")`:
   - El endpoint de layout se invalida.
   - **No se obliga a regenerar las 50 páginas hijas**, y viceversa.
   - Verificado con tests específicos de layout-level `allowISG(false)` e invalidación por tag.

---

## 5. Segmentación Vertical: `DinouCacheSlot` — *Implementado y Verificado (Nivel 1 & Nivel 2)*

### 5.1. Definición: Segmentación Horizontal vs. Vertical

| Dimensión | Enfoque | Granularidad | Beneficio Principal |
|---|---|---|---|
| **Horizontal** | Layouts vs. Páginas | Nivel de URL / Estructura | Preservación del shell de la aplicación y navegación instantánea. |
| **Vertical** | Estático vs. Dinámico dentro de la misma pantalla | Nivel de Componente / Ranura | TTFB de 0ms con datos en tiempo real sin sacrificar dinamismo. |

```
┌────────────────────────────────────────────────────────┐
│  Layout (Segmentación Horizontal - Caché fija)        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Página: Shell Estático / Dinámico               │  │
│  │  "Panel de Control"                              │  │
│  │  ┌────────────────────┐  ┌────────────────────┐  │  │
│  │  │ DinouCacheSlot     │  │ DinouCacheSlot     │  │  │
│  │  │ (Micro-ISR / SWR)  │  │ (Live Refreshable) │  │  │
│  │  │ slot-alpha         │  │ slot-beta          │  │  │
│  │  │ revalidate: 60s    │  │ tag: tag-beta      │  │  │
│  │  └────────────────────┘  └────────────────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### 5.2. Los Dos Niveles de DinouCacheSlot

`DinouCacheSlot` opera en dos niveles complementarios:

#### Nivel 1: Micro-ISR de Server Components & SWR
* Los Server Components envueltos en `<DinouCacheSlot id="slot-alpha" tag="tag-alpha" revalidate={60}>` se evalúan y se almacenan como fragmentos serializados JSX en `slots/:id/slot.json`.
* **Stale-While-Revalidate (SWR):** Cuando el TTL expira, la siguiente petición recibe inmediatamente el contenido previo mientras una promesa en segundo plano (`waitUntil`) regenera y actualiza el slot en Storage (`FileSystemStorage`, `CloudflareKVStorage`, `DenoKVStorage` o `MemoryStorage`).
* **Invalidación Granular por Tag:** Al ejecutar `revalidateTag("tag-alpha")` en una Server Action, únicamente el slot afectado es purgado de la caché. Los slots hermanos y la página mantienen sus datos intactos.

#### Nivel 2: Refresco en Vivo sin Recarga de Página
* Los slots se envuelven automáticamente en un componente cliente boundary (`DinouCacheSlotBoundary`).
* Mediante las funciones públicas de cliente:
  ```tsx
  import { refreshSlot, useRouter } from "dinou";

  // Función directa
  await refreshSlot("slot-alpha");

  // O a través del hook useRouter()
  const router = useRouter();
  await router.refreshSlot("slot-beta");
  ```
* El cliente solicita el fragmento actualizado al endpoint dedicado `/____rsc_slot____/:id`.
* **Cero recarga de página y cero re-render de hermanos:** React actualiza exclusivamente el subárbol DOM correspondiente al slot refrescado. El timestamp de la página y de los slots hermanos se mantiene inmutable.

#### Ejemplo de Implementación Integral

```tsx
// src/dashboard/page.tsx (Server Component)
import { DinouCacheSlot } from "dinou/server";
import { MetricWidget, LiveActivityWidget } from "./widgets";
import DashboardControls from "./DashboardControls";

export default async function DashboardPage() {
  const pageTime = Date.now();

  return (
    <main>
      <h1>Panel de Control</h1>
      <p>Render de Página: {pageTime}</p>

      {/* Nivel 1: Micro-ISR con TTL de 60s e invalidación por tag */}
      <DinouCacheSlot id="slot-metricas" tag="tag-metricas" revalidate={60}>
        <MetricWidget />
      </DinouCacheSlot>

      {/* Nivel 2: Slot listo para refresco en vivo sin reload */}
      <DinouCacheSlot id="slot-actividad" tag="tag-actividad">
        <LiveActivityWidget />
      </DinouCacheSlot>

      <DashboardControls />
    </main>
  );
}
```

```tsx
// src/dashboard/DashboardControls.tsx (Client Component)
"use client";
import { refreshSlot, useRouter } from "dinou";
import { invalidarMetricasAction } from "./actions";

export default function DashboardControls() {
  const router = useRouter();

  return (
    <div>
      {/* Nivel 1: Invalidación en servidor vía Server Action */}
      <button onClick={() => invalidarMetricasAction()}>
        Invalidar Métricas (Server Tag)
      </button>

      {/* Nivel 2: Refresco en cliente sin tocar la página */}
      <button onClick={() => refreshSlot("slot-actividad")}>
        Actualizar Actividad (Live Slot)
      </button>
      
      {/* O vía router */}
      <button onClick={() => router.refreshSlot("slot-actividad")}>
        Actualizar con useRouter
      </button>
    </div>
  );
}
```

### 5.3. Serialización JSX Nativa de React 19
En [dinou/core/cache-slot.js](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/cache-slot.js) se implementó un motor especializado de serialización y deserialización que soporta:
- Símbolos de React 19 (`Symbol.for("react.transitional.element")`).
- Referencias de componentes cliente (`Symbol.for("react.client.reference")`).
- Reconstrucción fiel de árboles JSX y props anidadas.

---

## 6. Tabla Comparativa de Estrategias en Dinou

| Capacidad | Dinou v6 (Anterior) | Dinou v7 (Actual) | Dinou v7.2 (PPR Próximo Hito) |
|---|---|---|---|
| **Granularidad de Navegación** | Monolítica (Página entera) | Segmentada Horizontal (Layouts vs Páginas) | Segmentada Horizontal + Vertical (PPR + Slots) |
| **Persistencia de Layouts en SPA** | Parcial / Re-evaluada | 100% Preservada (0 re-evaluaciones) | 100% Preservada |
| **Caché en Layouts** | No disponible | Completa (`layout_functions`, revalidate, tags) | Completa |
| **Micro-ISR por Componente** | No disponible | Implementado (`DinouCacheSlot` Nivel 1 & 2) | Integrado con PPR |
| **Refresco en Vivo de Slots** | No disponible | Implementado (`refreshSlot`, `useRouter`) | Implementado |
| **TTFB en Rutas Dinámicas** | Depende del SSR más lento | Rápido (Layouts cacheados) | Ultrarrápido (Shell estático 0ms + Stream) |
| **Aislamiento de Errores** | Pantalla global / Full reload | Localizada en Slot o Layout con rescate SPA | Localizada a nivel de Componente/Slot/Boundary |
| **Compatibilidad React 19** | Básica | Completa (use, Server Actions, Transitions) | Nativa con Streaming Reanudable |

---

## 7. Hoja de Ruta Actualizada (Roadmap)

```mermaid
timeline
    title Estado de Evolución Dinou v7.x
    Fase 1 (Completada) : Segmentación Horizontal : Endpoints desacoplados de Layout y Página con DinouPageSlot
    Fase 2 (Completada) : layout_functions : Soporte de revalidate, tags y allowISG independiente para Layouts
    Fase 3 (Completada) : DinouCacheSlot : Micro-ISR de Server Components (Nivel 1 SWR + Nivel 2 Live Refresh)
    Fase 4 (Próximo Hito) : Motor PPR (Partial Prerendering) : Shell estático en build + Reanudación por Streaming dinámico en runtime (Ver ppr.md)
    Fase 5 : Documentación Interactiva : Publicación en dinou-docs con ejemplos en vivo y demos de showcase
```

> La especificación detallada de la arquitectura, build y streaming del **Motor PPR (Fase 4)** se encuentra documentada en [ppr.md](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/ppr.md).
