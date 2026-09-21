# Dinou v7 — Arquitectura y Soporte para Cloudflare Workers & Wrangler

Este documento describe detalladamente la arquitectura, soluciones técnicas y el pipeline de compilación implementados en **Dinou v7** para permitir la ejecución y despliegue de **React 19 con React Server Components (RSC) nativos, Server-Side Rendering (SSR) en streaming y Server Functions** en el runtime de borde de **Cloudflare Workers** utilizando **Wrangler**.

---

## 1. El Desafío: React 19 RSC y SSR en Cloudflare Workers

Desplegar React Server Components junto con renderizado HTML en streaming dentro de un entorno Edge como Cloudflare Workers presenta retos de ingeniería mayúsculos:

1. **Conflicto de Condiciones de Módulos (Dual Condition Conflict)**:
   * **RSC Engine** requiere resolverse con la condición `"react-server"` (utilizando `@roggc/react-server-dom-esm` y la versión de React de servidor).
   * **SSR Engine** (generación de HTML en streaming) requiere resolverse con la condición `"browser"` (utilizando `react-dom/server.edge` y la versión de React de cliente).
   * En un único bundle tradicional de Node o Worker, estas dos condiciones son mutuamente excluyentes y colisionan, provocando errores de tipo *"ReactServer has been imported outside of react-server condition"*.
2. **Sin sistema de archivos físico (`node:fs`)**:
   Cloudflare Workers se ejecuta en el runtime **`workerd`** (aislados V8). No existe un disco físico ni llamadas síncronas de archivos. Un framework que intente descubrir páginas o leer archivos en caliente falla inmediatamente.
3. **Entorno estricto de ES Modules (ESM)**:
   Los workers se empaquetan como módulos ESM puros. Globales habituales de CommonJS (`__dirname`, `__filename`, `require`) no existen por defecto.
4. **Dependencias transitivas legacy en `node_modules`**:
   Librerías empaquetadas para múltiples formatos (como Jotai) incluyen versiones SystemJS (`System.register`) o UMD que causan `ReferenceError: System is not defined` en el Worker si se escanean o incluyen sin validación.
5. **Streaming de HTML y RSC unificado sin procesos hijos**:
   A diferencia de Node.js donde se pueden crear procesos separados (`fork`), en Edge todo el pipeline debe resolverse en un solo aislado V8 mediante Web Streams estándar (`ReadableStream`).

---

## 2. Arquitectura de la Solución: Pipeline Dual-Bundle de 3 Pasadas

Para resolver la colisión de condiciones y garantizar streaming real de HTML sin conversores sintéticos (eliminando definitivamente el antiguo `jsx-to-html.js`), Dinou v7 implementa una **arquitectura Dual-Bundle de 3 Pasadas**:

```
                             [ Petición entrante del Navegador ]
                                              │
                                              ▼
                  ┌────────────────────────────────────────────────────────┐
                  │          Cloudflare Worker (worker.js)                 │
                  │                 fetch(request, env, ctx)               │
                  └───────────────────────────┬────────────────────────────┘
                                              │
              ┌───────────────────────────────┴───────────────────────────────┐
              ▼                                                               ▼
    ¿Es Activo Estático / SSG?                                      ¿Es Ruta Dinámica / RSC / SF?
              │                                                               │
              ▼                                                               ▼
 ┌─────────────────────────┐                                    ┌───────────────────────────┐
 │     env.ASSETS.fetch    │                                    │   Worker Orchestrator     │
 │ (HTML pre-renderizado,  │                                    │   (Pass C)                │
 │  .rsc estático, JS/CSS) │                                    └─────────────┬─────────────┘
 └─────────────────────────┘                                                  │
                                             ┌────────────────────────────────┴────────────────────────────────┐
                                             ▼                                                                 ▼
                                ┌──────────────────────────────┐                                  ┌──────────────────────────────┐
                                │     Pass A: RSC Engine       │                                  │     Pass B: SSR Engine       │
                                │ (conditions: [react-server]) │                                  │  (conditions: [browser])     │
                                │                              │                                  │                              │
                                │ - React 19 Server Components │        RSC Payload Stream        │ - react-dom/server.edge      │
                                │ - Server Functions RPC       │ ───────────────────────────────> │ - SSR Client Manifest        │
                                │ - Client Component Proxies   │      (ReadableStream)            │ - HTML Streaming nativo      │
                                └──────────────────────────────┘                                  └──────────────┬───────────────┘
                                                                                                                 │
                                                                                                                 ▼
                                                                                                  [ Respuesta HTML Streaming ]
```

---

## 3. Pipeline de Compilación (`dinou/cloudflare/build.mjs`)

El compilador de Cloudflare ejecuta las siguientes fases automatizadas:

### 3.1. Generación Estática de Rutas (`route-modules.js`)
Escanea `src/` en tiempo de compilación y genera un módulo con imports estáticos de todas las páginas, layouts y vistas de error (`page.tsx`, `layout.tsx`, `error.tsx`), evitando cualquier resolución dinámica en disco.

### 3.2. Descubrimiento y Validación Semántica (`isSupportedClientModule`)
Identifica todos los Client Components (`'use client'`) y Server Functions (`'use server'`):
* **Inmunidad para el código del usuario**: Cualquier archivo dentro de `src/` (como `src/system/Button.tsx`) se acepta sin restricciones de nombres de carpetas.
* **Filtro semántico para `node_modules`**: Descarta automáticamente artefactos incompatibles con ESM:
  * Archivos SystemJS con `System.register(...)`.
  * Wrappers UMD/AMD sin exportaciones ESM ni CommonJS (`define.amd` sin `export` ni `module.exports`).
* **Multi-Bundler Manifest Support**: Lee e indexa las referencias generadas por Esbuild, Rollup o Webpack (`react-client-manifest.json`).
* **Protección de rutas cruzadas**: Normaliza rutas de archivo de Windows y POSIX (`file:///C:/` vs `file:///c:/` y rutas Unix de GitHub Actions `/home/runner/...`) evitando colisiones de claves duplicadas en los objetos.

### 3.3. Virtual File System en Memoria (`env-setup.js`)
Inyecta un snapshot de la jerarquía de `src/` en `globalThis.__DINOU_VFS__`. Los shims de `dinou/cloudflare/shims/fs.js` resuelven `existsSync`, `readFileSync` y `statSync` directamente contra este mapa en memoria.

### 3.4. Manifiesto SSR de Componentes Cliente (`ssr-client-manifest.js`)
Genera el mapa de componentes cliente y funciones de servidor requeridos para el SSR en Edge:
* Exporta `ssrManifest`: Mapa de identificadores de cliente a módulos cargados estáticamente.
* Exporta `ssrConsumerManifest`: Estructura `moduleMap` compatible con `createFromReadableStream` de React para deserializar el árbol de componentes durante el SSR.

### 3.5. Compilación Dual-Bundle (3 Pasadas de esbuild)

1. **Pass A — RSC Engine (`.dinou/cloudflare/rsc-engine.js`)**:
   * **Condiciones**: `["react-server"]`.
   * **Plugin `clientReferencesPlugin`**: Transforma los componentes cliente en proxies ligeros (`createClientModuleProxy`), permitiendo que el servidor RSC emita los identificadores correctos sin ejecutar código de navegador.
   * Empaqueta el router de Server Components y el ejecutor de Server Functions.

2. **Pass B — SSR Engine (`.dinou/cloudflare/ssr-engine.js`)**:
   * **Condiciones**: `["browser"]`.
   * Empaqueta `react-dom/server.edge` (`renderToReadableStream`) y `ssr-client-manifest.js` con los componentes cliente reales listos para renderizar HTML en el servidor.

3. **Pass C — Worker Orchestrator (`.dinou/cloudflare/worker.js`)**:
   * Une el adaptador [dinou/adapters/cloudflare.js](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/adapters/cloudflare.js), el RSC Engine y el SSR Engine.
   * Configura el `banner` ESM con `createRequire` y shims de variables globales (`__dirname`, `__filename`).
   * Genera el artefacto final autoportante listo para Wrangler.

---

## 4. Adaptador de Cloudflare (`dinou/adapters/cloudflare.js`)

El adaptador expone el objeto estándar `export default { fetch }` con las siguientes responsabilidades:

1. **Atención Prioritaria de `env.ASSETS`**:
   * Si la URL corresponde a un activo estático (`/assets/...`, `/favicon.ico`, bundles de cliente JS/CSS), se delega a `env.ASSETS.fetch(request)`.
   * Si la URL corresponde a una página HTML o payload RSC pre-renderizado estáticamente por SSG (sincronizados en `.dinou/dist3`), se entrega directamente desde la CDN de Cloudflare sin consumir CPU del Worker.
2. **Streaming Dinámico de HTML y RSC**:
   * Pasa las peticiones dinámicas a `handleRequest` con `runtime: "edge"`.
   * Las peticiones de navegación reciben un **HTML stream continuo** con soporte de Suspense (`renderToReadableStream`).
   * Las peticiones directas de RSC (con cabecera o sufijo `?_rsc`) reciben el flujo binario RSC puro.
3. **Soporte de ISR con Cloudflare KV (`CloudflareKVStorage`)**:
   * Si se vincula un namespace KV con el binding `DINOU_CACHE`, Dinou almacena y revalida en caché distribuida las páginas dinámicas bajo demanda (Incremental Static Regeneration).

---

## 5. Configuración de Wrangler (`wrangler.toml`)

Configuración oficial para Wrangler v4:

```toml
name = "dinou-cloudflare-app"
main = ".dinou/cloudflare/worker.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".dinou/dist3"
binding = "ASSETS"
html_handling = "auto-trailing-slash"

# Opcional: habilitar KV para caché de ISR (Incremental Static Regeneration)
# [[kv_namespaces]]
# binding = "DINOU_CACHE"
# id = "<TU_KV_NAMESPACE_ID>"
```

---

## 6. Comandos de Compilación, Pruebas y Despliegue

Dinou v7 permite compilar para Cloudflare usando cualquiera de los 3 empaquetadores soportados:

### Compilación según el Bundler

```bash
# 1. Con Esbuild (por defecto, ultrarrápido):
npm run build:cloudflare
# (o específicamente: npm run build:cloudflare:esbuild)

# 2. Con Rollup:
npm run build:cloudflare:rollup

# 3. Con Webpack:
npm run build:cloudflare:webpack
```

### Ejecución Local con Wrangler Dev

```bash
npx wrangler dev --port 3000
```

### Suite de Tests E2E en Cloudflare con Playwright

```bash
# Ejecuta la suite de Playwright contra Cloudflare Worker local
npm run test:cloudflare

# O especificando el empaquetador previo:
npm run test:cloudflare:esbuild
npm run test:cloudflare:rollup
npm run test:cloudflare:webpack
```

### Despliegue a Producción

```bash
npx wrangler deploy
```

---

## 7. Resumen de Ventajas Técnicas en Dinou v7

* **True React 19 Streaming**: Sin conversiones sintéticas ni librerías provisionales; HTML y RSC generados directamente por los motores oficiales de React 19 para Edge.
* **Separación Dual-Bundle Limpia**: Cero conflictos entre condiciones `react-server` y `browser`.
* **Empaquetado Seguro e Inmune**: Filtrado semántico de módulos en `node_modules` que garantiza la ausencia de SystemJS o dependencias no ejecutables en Edge.
* **Latencia Mínima y Cold Start Cero**: Bundle optimizado de ~500 KB ejecutándose directamente en los aislados V8 de la red global de Cloudflare.
