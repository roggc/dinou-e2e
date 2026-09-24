# Dinou v7: Arquitectura Universal y Despliegue en Cualquier Infraestructura ("Deploy Everywhere")

## 1. La Gran Revolución de Dinou v7

Durante años, los frameworks modernos de React con soporte para React Server Components (RSC) han adolecido de un grave problema en la industria: el **acoplamiento propietario (*vendor lock-in*)**. Muchas de las mejores capacidades de React 19 (Server Components, streaming asíncrono con Suspense, Server Functions RPC e Incremental Static Regeneration) parecían concebidas para ejecutarse únicamente en plataformas cloud propietarias o mediante arquitecturas monolíticas y pesadas de servidor.

**Dinou v7 rompe definitivamente con esa limitación:**
> **Cualquier aplicación Dinou escrita con React 19 y Server Components puede compilarse y desplegarse en absolutamente cualquier infraestructura del planeta:** desde un Cloudflare Worker de 0 ms de arranque en el borde de la red, pasando por Deno Deploy, Bun en bare metal, Node.js tradicional en contenedores Docker/Kubernetes, ejecutables binarios autocontenidos sin dependencias (`compile`), hasta hosting 100% estático gratuito (GitHub Pages, Surge, S3).

---

## 2. El Salto Arquitectónico: Del Legacy `fork()` al Pipeline Dual-Bundle Universal

### 2.1. El Problema Histórico de React 19: El Conflicto de Condiciones
En React 19 existe una incompatibilidad fundamental a nivel de empaquetado conocida como el **Dual Condition Conflict**:
* **RSC Engine** (servidor de componentes): Requiere que los módulos se resuelvan con la condición `"react-server"`. En esta condición, los módulos de React no tienen acceso a APIs de cliente (como `useState`, `useEffect` o `react-dom/server`).
* **SSR Engine** (generador de HTML en streaming): Requiere que los módulos se resuelvan con la condición `"browser"` o de cliente (`react-dom/server.edge` o `react-dom/server.node`).
* Si ambos motores se importan en un mismo contexto sin aislar, React lanza el error fatal:
  ```text
  ReactServer has been imported outside of react-server condition.
  ```

### 2.2. La Solución Antigua (Legacy): El Proceso Hijo (`fork`)
En versiones anteriores (y en muchos frameworks del ecosistema), este conflicto se sorteaba en Node.js levantando un proceso hijo mediante `child_process.fork()`:
1. El proceso padre ejecutaba el servidor HTTP y el motor SSR en condición normal.
2. Cada vez que se requería renderizar Server Components, el proceso padre enviaba un mensaje IPC al proceso hijo (ejecutado con `node --conditions=react-server`).
3. El proceso hijo generaba el stream binario de RSC y lo transfería por IPC de vuelta al padre.

#### ¿Por qué era insostenible el `fork`?
* **Latencia y Serialización IPC**: Cada petición incurría en el coste de serializar y deserializar streams entre dos procesos del sistema operativo.
* **Consumo de Memoria Doble**: Dos procesos Node.js completos en ejecución por cada réplica del servidor.
* **Imposible de desplegar en Edge y Serverless**: En entornos como **Cloudflare Workers**, **Deno Deploy**, **AWS Lambda** o **Vercel Functions**, la API `child_process.fork()` **no existe**.
* **Imposible de compilar a binario único**: Ni `bun build --compile` ni `deno compile` pueden empaquetar una aplicación que depende de bifurcar procesos hijos externos.

---

### 2.3. La Solución Dinou v7: La Arquitectura Dual-Bundle de 3 Pasadas (AOT)
La solución desarrollada originalmente para conquistar Cloudflare Workers ([`CLOUDFLARE_WRANGLER.md`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/CLOUDFLARE_WRANGLER.md)) demostró ser tan limpia, eficiente y universal que **en Dinou v7 se ha estandarizado como la arquitectura central para TODOS los entornos (Node, Deno, Bun y Cloudflare)**.

Se elimina por completo el `fork()` y se sustituye por un pipeline Ahead-Of-Time (AOT) de 3 pasadas:

```
                             [ Petición Entrante (HTTP / Fetch) ]
                                              │
                                              ▼
                  ┌────────────────────────────────────────────────────────┐
                  │                 Orquestador Principal                  │
                  │   Node (server.mjs) / Deno (main.js) / Bun / Worker    │
                  └───────────────────────────┬────────────────────────────┘
                                              │
              ┌───────────────────────────────┴───────────────────────────────┐
              ▼                                                               ▼
    ¿Activo Estático / SSG?                                         ¿Ruta Dinámica / RSC / SF?
              │                                                               │
              ▼                                                               ▼
 ┌─────────────────────────┐                                    ┌───────────────────────────┐
 │   Entrega Inmediata     │                                    │   Worker Orchestrator     │
 │ (Disk / KV / CDN Assets)│                                    │   (Pass C)                │
 └─────────────────────────┘                                    └─────────────┬─────────────┘
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

#### Las 3 Pasadas de Compilación:
1. **Pass A — RSC Engine**:
   - Se compila con las condiciones `["react-server"]`.
   - Transforma los Client Components (`"use client"`) en proxies ligeros (`createClientModuleProxy`) mediante el plugin `clientReferencesPlugin`. Esto permite que el servidor RSC emita los identificadores de referencia sin cargar código de navegador.
   - Registra y expone las Server Functions (`"use server"`).
2. **Pass B — SSR Engine**:
   - Se compila con las condiciones `["browser"]` (o entorno cliente).
   - Empaqueta `react-dom/server.edge` (`renderToReadableStream`) junto con el `ssr-client-manifest.js` autogenerado, conteniendo los componentes cliente reales listos para hidratar y renderizar el árbol HTML en streaming.
3. **Pass C — Orchestrator (Runtime Adapter)**:
   - Enlaza en memoria Pass A y Pass B conectándolos mediante Web Streams estándar (`ReadableStream`).
   - Sirve activos estáticos con caché óptima y gestiona la capa de persistencia y revalidación (ISR).

---

### 2.4. Dinou v7 vs v6: De Camión Pesado a Ferrari de Carreras (La Metamorfosis Técnica)

La evolución de Dinou v6 a Dinou v7 no ha sido una simple actualización incremental, sino una **refundación arquitectónica integral**. Si **Dinou v6 era un camión diésel de carga pesada con remolque**, **Dinou v7 es un monoplaza de Fórmula 1 / Ferrari de pura fibra de carbono**:

| Área Arquitectónica | 🚛 Dinou v6 (Camión Pesado) | 🏎️ Dinou v7 (Ferrari Monoplaza) |
| :--- | :--- | :--- |
| **Motor de Renderizado** | `child_process.fork()` + Babel JIT en runtime. Cada render exigía serialización IPC pesada entre procesos del SO. | **Dual-Bundle AOT In-Memory**. Renderizado directo en memoria RAM mediante Web Streams nativos de React 19. |
| **Chasis y Middleware** | Monolito **Express** + parches en `require.extensions` (`asset-require-hook`, `css-require-hook`) + Chokidar. | **Puro Web Standards** (`Request`, `Response`, `ReadableStream`). Sin Express ni dependencias pesadas en tiempo de ejecución. |
| **Concurrencia y RAM** | Exigía un limitador (`concurrency-manager.js`) para evitar colapsar la CPU/RAM ("fork bomb"). | **Consumo de memoria plano y predecible**. Miles de streams concurrentes asíncronos en el event loop nativo sin forks. |
| **SSG / ISG / ISR** | Pipelines duplicados y divergentes (`generate-static-pages.js` vs `generate-static-page.js`) basados en subprocesos. | **Pipeline único y universal**: El mismo motor en memoria de ISG (`storageAdapter`) pre-renderiza cientos de páginas en segundos. |
| **Portabilidad (Cross-Runtime)** | Fragmentado y atado a Node CJS. Bun requería plugins JIT experimentales; imposible en Edge/Serverless. | **Universal "Deploy Everywhere"**: Idéntico en Node Standalone (`server.mjs`), Bun, Deno (con binarios únicos) y Cloudflare. |
| **Rendimiento de Tests E2E** | Ejecución lenta (~15-20 min), vulnerable a cuelgues por sockets IPC y timeouts de procesos hijos. | **377 tests pasados al 100% en ~4 minutos** en paralelo en Chromium, Firefox y WebKit con cero fallos. |
| **Higiene de Código** | Dependencias legacy, wrappers redundantes y loaders experimentales. | **~2.200 líneas de código muerto eliminadas** (14 archivos obsoletos purgados definitivamente). |

---

## 3. Características Fundamentales de la Arquitectura v7

### 3.1. Estándares Web de la W3C en el Núcleo
El manejador principal (`handleRequest` en [`dinou/core/handler.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/handler.js)) es 100% agnóstico del runtime. Trabaja exclusivamente con interfaces estándar:
- `Request` y `Response` nativos (Web Fetch API).
- `ReadableStream` y `TransformStream` para streaming continuo de HTML y payloads RSC.
- `Headers`, `URL`, `URLSearchParams` y gestión estandarizada de cookies.

### 3.2. Manifiestos Agnósticos del Empaquetador
Dinou no te ata a un único bundler. El pipeline compila sobre cualquiera de los 3 grandes motores del ecosistema:
- **Esbuild**: Compilación en milisegundos para desarrollo y producción ultrarrápida.
- **Rollup**: Árbol de dependencias optimizado con tree-shaking quirúrgico.
- **Webpack**: Máxima compatibilidad con plugins legacy del ecosistema empresarial.

### 3.3. Sistema de Archivos Virtual (VFS) y Aislamiento Semántico de `node_modules`
Para correr en plataformas sin disco físico (`workerd` en Cloudflare o Deno Deploy):
- Dinou genera un **Virtual File System en memoria (`__DINOU_VFS__`)** con la estructura de rutas descubierta durante el build.
- **Filtro Semántico de Dependencias**: Analiza el código de `node_modules` para evitar que bundles no compatibles (como wrappers SystemJS o UMD antiguos presentes en paquetes como Jotai) contaminen el bundle del servidor.

### 3.4. Capa Universal de Almacenamiento e ISR (`StorageAdapter`)
Dinou desacopla la caché estática y la regeneración incremental (ISR / ISG) del disco mediante el contrato abstracto de [`dinou/core/storage-adapter.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/storage-adapter.js):
- **`FileSystemStorage`**: Utilizado en Node.js y Bun (almacena en disco físico `.dinou/dist2`).
- **`DenoKVStorage`**: Utilizado en Deno y Deno Deploy (persiste en la base de datos distribuida Deno KV, sin requerir disco).
- **`CloudflareKVStorage`**: Utilizado en Cloudflare Workers mediante bindings de KV.
- **`MemoryStorage`**: Para entornos efímeros o tests en memoria.

---

## 4. Opciones y Guía de Despliegue ("Deploy Everywhere")

Dinou v7 permite desplegar la misma aplicación en cualquiera de los siguientes destinos:

| Destino de Despliegue | Runtime en Producción | Motor de Caché / ISR | Comando de Build | Comando de Arranque / Deploy |
| :--- | :--- | :--- | :--- | :--- |
| **Node.js AOT** | Node.js (>= 18) | FileSystem | `npm run build:node` | `npm run start:node` |
| **Bun Standalone** | Bun | FileSystem | `npm run build:bun` | `npm run start:bun` |
| **Bun Pure (Sin Node)** | Bun (100% nativo) | FileSystem | `npm run build:bun:pure` | `npm run start:bun` |
| **Bun Binario (`compile`)** | Ninguno (Ejecutable) | FileSystem | `npm run build:bun:compile` | `./dist/server` |
| **Deno Standalone** | Deno CLI | Deno KV (disco) | `npm run build:deno` | `npm run start:deno` |
| **Deno Deploy (Edge)** | Deno Deploy | Deno KV (global) | `npm run build:deno` | `deployctl deploy .dinou/deno/main.js` |
| **Deno Binario (`compile`)**| Ninguno (Ejecutable) | Deno KV (embebido)| `npm run build:deno:compile`| `./dist/deno-server` |
| **Cloudflare Workers** | workerd (V8 Isolates) | Cloudflare KV | `npm run build:cloudflare` | `npx wrangler deploy` |
| **Netlify Functions v2**| Netlify Edge | CDN Cache | `npm run build` | `git push netlify` |
| **Hosting Estático (SSG)**| Servidor Web / CDN | Pre-renderizado | `npm run export-static` | Subir carpeta `out/` |

---

### A. Despliegue en Node.js (Servidores VPS, Docker, PM2, PaaS)
Gracias al nuevo orquestador AOT Dual-Bundle de Dinou v7, Node.js ya no utiliza `fork()`. Ambos motores (RSC y SSR) corren en el mismo proceso con cero latencia IPC.

1. **Compilación**:
   ```bash
   npm run build:node
   # o con tu bundler preferido: npm run build:node:esbuild / :rollup / :webpack
   ```
2. **Ejecución**:
   ```bash
   npm run start:node
   ```
3. **Despliegue con Docker**:
   ```dockerfile
   FROM node:20-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --omit=dev
   COPY . .
   RUN npm run build:node
   EXPOSE 3000
   CMD ["npm", "run", "start:node"]
   ```

---

### B. Despliegue en Bun (Máximo Rendimiento o Binario Standalone)
Bun ofrece arranque instantáneo y streaming de archivos a nivel de kernel (`Bun.file`).

1. **Modo Estándar (Compilado con Node, ejecutado con Bun)**:
   ```bash
   npm run build:bun
   npm run start:bun
   ```
2. **Modo Pure Bun (100% Bun, sin Node en el entorno de CI/Build)**:
   ```bash
   npm run build:bun:pure
   npm run start:bun
   ```
3. **Modo Binario Autónomo (`bun build --compile`)**:
   Empaqueta el runtime y la aplicación en un ejecutable binario único listo para correr en máquinas sin Bun ni Node:
   ```bash
   npm run build:bun:compile
   # Ejecuta el binario resultante:
   ./dist/server
   ```

---

### C. Despliegue en Deno y Deno Deploy
Deno aporta seguridad granular por permisos, compatibilidad nativa con TypeScript y persistencia integrada mediante Deno KV.

1. **Deno Standalone (VPS, Docker o Contenedor)**:
   ```bash
   npm run build:deno
   npm run start:deno
   ```
2. **Deno Deploy (Edge Global Distribuido sin Servidor)**:
   ```bash
   npm run build:deno
   deployctl deploy --project=<mi-proyecto> .dinou/deno/main.js
   ```
   *Dinou detecta automáticamente `Deno.openKv()` en Deno Deploy y almacena las páginas de ISR en la red global de Deno.*
3. **Deno Binario Autónomo (`deno compile`)**:
   Genera un archivo ejecutable único con Deno KV y permisos embebidos:
   ```bash
   npm run build:deno:compile
   # Ejecuta el binario directamente:
   ./dist/deno-server
   ```

---

### D. Despliegue en Cloudflare Workers (Wrangler)
Ejecución en más de 300 ciudades con latencia casi nula y arranque en 0 ms.

1. **Compilación para Cloudflare**:
   ```bash
   npm run build:cloudflare
   # (Genera el artefacto .dinou/cloudflare/worker.js)
   ```
2. **Previsualización local con Wrangler**:
   ```bash
   npx wrangler dev --port 3000
   ```
3. **Despliegue a la red de Cloudflare**:
   ```bash
   npx wrangler deploy
   ```
   *(La configuración en `wrangler.toml` delega los activos estáticos y páginas SSG a `env.ASSETS` para servirlos directamente desde la CDN de Cloudflare sin coste de cómputo)*.

---

### E. Despliegue en Netlify (Functions v2)
Dinou incluye soporte oficial para Netlify Functions v2 mediante [`dinou/adapters/netlify.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/adapters/netlify.js):

1. En tu proyecto, crea `netlify/functions/dinou.js`:
   ```javascript
   export { default, config } from "dinou/adapters/netlify";
   ```
2. Configura tu `netlify.toml`:
   ```toml
   [build]
     command = "npm run build"
     publish = ".dinou/dist3"

   [functions]
     directory = "netlify/functions"
   ```
3. Gracias a `preferStatic: true`, Netlify entrega los archivos de `.dinou/dist3` directamente desde su CDN y sólo invoca la función para SSR dinámico y Server Functions.

---

### F. Hosting 100% Estático (SSG Puro)
Si tu aplicación sólo utiliza Static Site Generation y Client Components, puedes exportarla sin ningún servidor backend:

1. **Exportación estática**:
   ```bash
   npm run export-static
   ```
   *Genera la carpeta unificada `out/` con todos los HTML y payloads RSC pre-renderizados.*
2. **Subida directa**:
   - **GitHub Pages**: `npx gh-pages -d out`
   - **Surge.sh**: `npx surge out tu-dominio.surge.sh`
   - **AWS S3 / DigitalOcean Spaces**: Copiando el contenido de `out/` a tu bucket.

---

## 5. La Carpeta Estática Estándar: `public/`

Dinou v7 adopta el estándar de la industria:
- Todo archivo ubicado en `public/` (`favicon.ico`, `robots.txt`, `sitemap.xml`, imágenes, fuentes, etc.) se copia directamente a la raíz pública durante la compilación.
- Se sirve de forma inmediata en la raíz de tu dominio (ejemplo: `public/robots.txt` -> `https://tu-dominio.com/robots.txt`).
- Mantiene compatibilidad transparente con proyectos anteriores que utilicen la carpeta `favicons/`.

---

## 6. Mapa Completo de Scripts en `package.json`

Dinou v7 organiza sus scripts en una matriz coherente por **Objetivo de Despliegue** y **Herramienta de Compilación**:

```text
├── build / dev / start                      (Desarrollo y build general por defecto)
│
├── Node.js AOT Dual-Bundle:
│   ├── build:node                           (Alias -> build:node:esbuild)
│   ├── build:node:esbuild / :rollup / :webpack
│   └── start:node / :esbuild / :rollup / :webpack
│
├── Deno & Deno Deploy:
│   ├── build:deno                           (Genera .dinou/deno/main.js y sincroniza KV)
│   ├── build:deno:esbuild / :rollup / :webpack
│   ├── build:deno:compile                   (Compila a binario para el OS actual)
│   ├── build:deno:compile:esbuild / :rollup / :webpack
│   ├── build:deno:compile:linux             (Compila para Linux x64 -> dist/deno-server-linux)
│   ├── build:deno:compile:linux:esbuild / :rollup / :webpack
│   ├── build:deno:compile:linux_arm         (Compila para Linux ARM64 -> dist/deno-server-linux-arm)
│   ├── build:deno:compile:linux_arm:esbuild / :rollup / :webpack
│   ├── build:deno:compile:mac               (Compila para macOS Apple Silicon -> dist/deno-server-mac)
│   ├── build:deno:compile:mac:esbuild / :rollup / :webpack
│   ├── build:deno:compile:win               (Compila para Windows x64 -> dist/deno-server-win.exe)
│   ├── build:deno:compile:win:esbuild / :rollup / :webpack
│   └── start:deno                           (Arranca adaptador nativo Deno CLI)
│
├── Bun Standalone & Compile:
│   ├── build:bun                            (Genera .dinou/bun/server.js)
│   ├── build:bun:esbuild / :rollup / :webpack
│   ├── build:bun:compile                    (Compila a binario para el OS actual)
│   ├── build:bun:compile:esbuild / :rollup / :webpack
│   ├── build:bun:compile:linux              (Compila para Linux x64 -> dist/server-linux)
│   ├── build:bun:compile:linux:esbuild / :rollup / :webpack
│   ├── build:bun:compile:linux_arm          (Compila para Linux ARM64 -> dist/server-linux-arm)
│   ├── build:bun:compile:linux_arm:esbuild / :rollup / :webpack
│   ├── build:bun:compile:mac                (Compila para macOS Apple Silicon -> dist/server-mac)
│   ├── build:bun:compile:mac:esbuild / :rollup / :webpack
│   ├── build:bun:compile:win                (Compila para Windows x64 -> dist/server-win.exe)
│   ├── build:bun:compile:win:esbuild / :rollup / :webpack
│   ├── build:bun:pure                       (Build 100% Bun, sin Node -> :esbuild)
│   ├── build:bun:pure:esbuild / :rollup / :webpack
│   ├── build:bun:pure:compile               (Compila a binario usando 100% Bun)
│   ├── build:bun:pure:compile:esbuild / :rollup / :webpack
│   ├── build:bun:pure:compile:linux         (Compila a binario Linux x64 con 100% Bun)
│   ├── build:bun:pure:compile:linux:esbuild / :rollup / :webpack
│   ├── build:bun:pure:compile:linux_arm     (Compila a binario Linux ARM64 con 100% Bun)
│   ├── build:bun:pure:compile:linux_arm:esbuild / :rollup / :webpack
│   ├── build:bun:pure:compile:mac           (Compila a binario macOS Apple Silicon con 100% Bun)
│   ├── build:bun:pure:compile:mac:esbuild / :rollup / :webpack
│   ├── build:bun:pure:compile:win           (Compila a binario Windows x64 con 100% Bun)
│   ├── build:bun:pure:compile:win:esbuild / :rollup / :webpack
│   └── start:bun / :esbuild / :rollup / :webpack
│
├── Cloudflare Workers:
│   ├── build:cloudflare                     (Genera .dinou/cloudflare/worker.js)
│   ├── build:cloudflare:esbuild / :rollup / :webpack
│   └── test:cloudflare                      (Tests E2E con Wrangler y Playwright)
│
└── Static Site Generation (SSG):
    ├── export-static                        (Alias -> export-static:esbuild)
    └── export-static:esbuild / :rollup / :webpack
```

---

## 7. Conclusión: Independencia, Rendimiento y Futuro

La arquitectura de **Dinou v7** demuestra que es posible disfrutar de toda la potencia de **React 19 (Server Components, Streaming SSR, Server Functions e ISR)** sin renunciar a la libertad de infraestructura:
* **Sin procesos hijos (`fork`)**: Arquitectura AOT unificada, ligera y ultrarrápida.
* **Sin ataduras a proveedores**: La misma aplicación se ejecuta en una función Edge de Cloudflare, en un cluster Kubernetes con Node, en una máquina virtual con Bun o como un binario autocontenido.
* **Basado en Estándares**: Tu código no depende de APIs propietarias, sino de los estándares web universales de la W3C.
