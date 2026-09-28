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
| **Entorno de Desarrollo y HMR** | Servidor dependiente de `fork()`, watchers Chokidar duplicados, recargas completas del navegador al cambiar CSS o directivas. | **Proceso único (0 forks)** con motor Dual incremental en RAM (<80ms), sincronización en caliente de directivas (`use client`/`use server`), React Fast Refresh con preservación de estado y Hot CSS swapping sin recargas. |
| **Higiene de Código** | Dependencias legacy, wrappers redundantes y loaders experimentales. | **~2.200 líneas de código muerto eliminadas** (14 archivos obsoletos purgados definitivamente). |

---

## 3. La Experiencia de Desarrollo v7 (DX): Motor Dual en Proceso Único (0 Forks) y Next-Gen HMR

El salto a la arquitectura Dual-Bundle de Dinou v7 no solo beneficia a la producción; ha transformado de raíz la experiencia de desarrollo local (`npm run dev`):

### 3.1. Servidor de Desarrollo In-Process (0 Forks) y Watcher Unificado
En versiones anteriores, el servidor de desarrollo requería bifurcar procesos hijos para compilar y ejecutar React Server Components mientras otro proceso gestionaba el empaquetado del cliente. Cada proceso mantenía su propio observador de archivos (`chokidar`), provocando duplicación de eventos de I/O en disco, latencias de sincronización y posibles desincronizaciones de manifiestos.

En **Dinou v7**, el archivo [`dinou/node/dev.mjs`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/node/dev.mjs) consolida todo en un **único proceso Node.js**:
* **Recompilación Incremental en RAM**: Tanto Pass A (RSC Engine) como Pass B (SSR Engine) se gestionan mediante contextos incrementales de esbuild (`ctxA.rebuild()` y `ctxB.rebuild()`) que reconstruyen los módulos modificados en memoria en 30–80 ms.
* **Watcher Centralizado**: Un único observador Chokidar monitoriza la carpeta `src/`. Cuando se detecta un cambio, notifica en memoria tanto a los motores del servidor como al empaquetador del cliente de forma coordinada, garantizando que el manifiesto de cliente esté sincronizado antes de emitir cualquier actualización.
* **Cero Procesos Huérfanos**: Al detener el servidor con `Ctrl + C`, no quedan procesos hijos zombies reteniendo puertos ni consumiendo memoria.

### 3.2. React Fast Refresh y ESM-HMR de Nueva Generación
Dinou v7 incorpora un pipeline de HMR altamente refinado que garantiza la continuidad del estado de la aplicación durante la codificación:
* **Preservación Total del Estado en Componentes Cliente (`"use client"`)**: Los cambios en componentes interactivos se parchean en el navegador vía ESM-HMR y React Refresh Runtime, preservando íntegramente hooks como `useState`, `useReducer`, entradas de formularios y estados de UI.
* **Detección Dinámica de Directivas en Caliente**: Si un desarrollador añade o retira `"use client"` o `"use server"` de un archivo existente, Dinou detecta la transición de directiva en tiempo real, regenera automáticamente las entradas de empaquetado y recrea el bundle del cliente sin requerir un reinicio manual de `npm run dev`.
* **HMR de Activos Estáticos e Imágenes**: Importaciones de imágenes (`.png`, `.jpg`, `.svg`), fuentes y recursos multimedia dentro de componentes cliente se resuelven y actualizan en caliente sin romper el árbol de React.
* **Hot CSS Swapping Instantáneo (`style-update`)**:
  * Cualquier modificación en una hoja de estilos `.css` (global, en Layout o importada por componentes) es extraída y emitida mediante un evento `{ type: "style-update", url: "/styles.css" }`.
  * El runtime cliente de Dinou actualiza dinámicamente el `<link rel="stylesheet">` con un parámetro de tiempo (`?t=...`), aplicando los nuevos estilos visuales **al instante, sin recargar la página, sin parpadeo y sin desmontar los componentes ni reiniciar el estado**.
  * Los chunks dummy de CSS quedan completamente aislados del motor de Fast Refresh, previniendo recargas espurias del navegador.

### 3.3. Paridad Absoluta en los 3 Empaquetadores (Esbuild, Rollup, Webpack)
La experiencia de desarrollo local es homogénea independientemente de la herramienta elegida:
* `npm run dev:esbuild`: Reconstrucción ultrarrápida en milisegundos ideal para iteración diaria ágil.
* `npm run dev:rollup`: Ideal para depurar la estructura final de chunks y módulos ESM.
* `npm run dev:webpack`: Paridad absoluta para ecosistemas empresariales que dependen de plugins específicos de Webpack.
Todos comparten los mismos protocolos de comunicación WebSocket, manifiestos estandarizados y semántica de HMR.

### 3.4. Arquitectura 100% en Memoria (Zero Disk I/O) y Fast-Path de Server Functions

En proyectos de gran envergadura (con miles de componentes, documentación técnica y decenas de paquetes npm), el cuello de botella tradicional de los frameworks residía en dos factores críticos: **la saturación de I/O en disco durante el desarrollo** y **el análisis exhaustivo de ASTs de Babel en busca de directivas `"use server"`**.

Dinou v7 introduce dos optimizaciones profundas integradas de forma uniforme en **Esbuild, Rollup y Webpack**:

#### A. Desarrollo 100% en RAM (`globalThis.__DINOU_MEM_FILES__` y Cero I/O)
* **Eliminación Total de `.dinou/public` en Disco**: En modo desarrollo (`npm run dev:*`), ninguno de los tres empaquetadores escribe archivos a disco. Chunks de JavaScript, hojas de estilo compiladas (`styles.css`), mapas de origen (`.map`) y los 3 manifiestos (`react-client-manifest.json`, `server-functions-manifest.json` y `manifest.json`) se almacenan directamente como buffers binarios en un registro global en memoria RAM (`globalThis.__DINOU_MEM_FILES__`).
* **Servicio In-Memory a Latencia Cero**: El servidor HTTP de Dinou (`dev.mjs`) despacha cualquier activo estático solicitado por el navegador directamente desde la memoria RAM en `<0.5ms`, sin abrir ni consultar descriptores de archivos del sistema operativo.
* **Sin Sobrecarga de I/O ni Antivirus en Windows**: Se erradican las miles de escrituras y eliminaciones síncronas que ralentizaban el arranque local en Windows debido a escaneos de seguridad e indexadores de archivos. En desarrollo estándar, el directorio `.dinou/public` ni siquiera llega a crearse.
* **Modo Inspección (`DINOU_WRITE_TO_DISK=true`)**: Si el desarrollador desea auditar físicamente el contenido de los paquetes generados, basta con activar esta variable de entorno para que el pipeline dev vuelque todos los archivos a `.dinou/public`.
* **Garantía Estricta de Producción**: En compilaciones de producción (`npm run build:*`), todos los bundlers vuelcan con total integridad los artefactos físicos finales a `.dinou/dist3` (y `.dinou/dist2` para SSG).

#### B. Fast-Path Reactivo de Server Functions
* **Bypass Inmediato en O(1)**: Anteriormente, cada archivo `.js`, `.jsx`, `.ts` y `.tsx` era analizado con expresiones regulares y parseo de AST con Babel en los loaders de Server Functions para determinar si contenía la directiva `"use server"`. En aplicaciones grandes, esto consumía valiosos segundos de CPU en cientos de archivos que eran simples componentes de UI o utilidades.
* **Indexación en Fase de Descubrimiento**: Tanto `get-esbuild-entries`, como `rollup-plugin-server-functions` y `get-webpack-entries` indexan previamente los archivos que declaran `"use server"` en un `Set` (`serverFiles`). Los loaders y plugins realizan un filtrado inmediato en O(1): si el módulo no está en el conjunto y no contiene la directiva, se devuelve intacto en microsegundos, saltándose todo el pipeline de Babel.
* **Reactividad Dinámica en Caliente**: Si un desarrollador añade `"use server"` a un archivo existente o retira la directiva durante una sesión de desarrollo activa, el sistema detecta dinámicamente la transición y actualiza el índice en tiempo real sin requerir reinicios manuales.

#### C. Impacto en Métricas Reales (`dinou-docs`)
En aplicaciones complejas como `dinou-docs` (con más de 2.280 módulos de `node_modules`, decenas de páginas de documentación y más de 25 MB de assets compilados):
* **Esbuild**: Reducción del arranque en frío de **~124 segundos a 11.2 segundos** (una aceleración de más del **91%**) y arranque en caliente en **8.3 segundos**.
* **Rollup**: Compilación del bundle de cliente en **21.7s** y arranque total en caliente en **28.4s**.
* **Webpack**: Compilación de **25 MB de JS, 330+ assets y 2.280 módulos en 15.0 segundos**, manteniendo **0 bytes** escritos a disco en desarrollo.
* **Validación 100% Verde**: 377+ pruebas de Playwright pasadas con éxito en paralelo en Chromium, Firefox y WebKit a través de todos los adaptadores (Node, Bun, Deno y Cloudflare Workers).

### 3.5. Selección Inteligente e Interactiva de Puertos en Desarrollo (`port-selector`)

En entornos de desarrollo local es común tener múltiples aplicaciones Dinou u otros servidores ejecutándose simultáneamente en los puertos por defecto `3000` (servidor HTTP principal) y `3001` (servidor WebSocket de HMR). Anteriormente, si el puerto 3000 o 3001 estaban ocupados, el servidor arrojaba un error `EADDRINUSE` y el proceso terminaba abruptamente.

Dinou v7 introduce un gestor de puertos inteligente ([`dinou/node/port-selector.mjs`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/node/port-selector.mjs)) con las siguientes características:

* **Detección de Pares Consecutivos Libres `[Port, Port + 1]`**:
  Dinou verifica en milisegundos (`node:net`) que tanto el puerto del servidor HTTP como el puerto complementario de HMR estén libres. Si el puerto 3000 o 3001 están ocupados, localiza automáticamente el siguiente par consecutivo disponible (por ejemplo, `3002` para HTTP y `3003` para HMR). Mantiene la paridad par/impar para evitar cualquier colisión entre puertos HTTP y WebSocket.
* **Flujo Interactivo en Terminal (TTY)**:
  Si la terminal es interactiva (`isTTY`), antes de inicializar los motores de compilación se pregunta limpiamente al desarrollador:
  ```text
  ⚠️  Port 3000 is in use.
  ? Would you like to use port 3002 instead? (Y/n)
  ```
  - Al pulsar **Enter** o responder **Y**, Dinou conmuta automáticamente a los puertos seleccionados (`3002` y `3003`).
  - Al responder **N**, el proceso se detiene de forma limpia con código de salida `0` sin trazas de error.
* **Protección Estricta en CI y Entornos No Interactivos**:
  En entornos de integración continua (CI) como GitHub Actions o ejecuciones no interactivas (`!process.stdout.isTTY || process.env.CI`), Dinou no bloquea la entrada estándar; muestra inmediatamente el mensaje de error fatal en inglés y sale con código `1`.
* **Sincronización Total en los 3 Bundlers (`esbuild`, `rollup`, `webpack`)**:
  - Tanto `esbuild` (`esm-hmr-plugin.mjs`) como `rollup` (`rollup-plugin-esm-hmr.js`) vinculan el WebSocket de HMR al puerto desplazado (`HMR_PORT = PORT + 1`).
  - El motor de SSR inyecta la URL del WebSocket (`ws://localhost:${HMR_PORT}`) en el cliente web.
  - En `webpack` (`webpack.config.js`), `WebpackDevServer` adopta dinámicamente `HMR_PORT` para su WebSocket de live reload (`ws://localhost:${HMR_PORT}/ws`) y actualiza la regla de proxy hacia `http://localhost:${PORT}`.

---

## 4. Características Fundamentales de la Arquitectura v7

### 4.1. Estándares Web de la W3C en el Núcleo
El manejador principal (`handleRequest` en [`dinou/core/handler.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/handler.js)) es 100% agnóstico del runtime. Trabaja exclusivamente con interfaces estándar:
- `Request` y `Response` nativos (Web Fetch API).
- `ReadableStream` y `TransformStream` para streaming continuo de HTML y payloads RSC.
- `Headers`, `URL`, `URLSearchParams` y gestión estandarizada de cookies.

### 4.2. Manifiestos Agnósticos del Empaquetador
Dinou no te ata a un único bundler. El pipeline compila sobre cualquiera de los 3 grandes motores del ecosistema:
- **Esbuild**: Compilación en milisegundos para desarrollo y producción ultrarrápida.
- **Rollup**: Árbol de dependencias optimizado con tree-shaking quirúrgico.
- **Webpack**: Máxima compatibilidad con plugins legacy del ecosistema empresarial.

### 4.3. Sistema de Archivos Virtual (VFS) y Aislamiento Semántico de `node_modules`
Para correr en plataformas sin disco físico (`workerd` en Cloudflare o Deno Deploy):
- Dinou genera un **Virtual File System en memoria (`__DINOU_VFS__`)** con la estructura de rutas descubierta durante el build.
- **Filtro Semántico de Dependencias**: Analiza el código de `node_modules` para evitar que bundles no compatibles (como wrappers SystemJS o UMD antiguos presentes en paquetes como Jotai) contaminen el bundle del servidor.

### 4.4. Capa Universal de Almacenamiento e ISR (`StorageAdapter`)
Dinou desacopla la caché estática y la regeneración incremental (ISR / ISG) del disco mediante el contrato abstracto de [`dinou/core/storage-adapter.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/storage-adapter.js):
- **`FileSystemStorage`**: Utilizado en Node.js y Bun (almacena en disco físico `.dinou/dist2`).
- **`DenoKVStorage`**: Utilizado en Deno y Deno Deploy (persiste en la base de datos distribuida Deno KV, sin requerir disco).
- **`CloudflareKVStorage`**: Utilizado en Cloudflare Workers mediante bindings de KV.
- **`MemoryStorage`**: Para entornos efímeros o tests en memoria.

### 4.5. Sistema Universal de Middleware y Webhooks (`onRequest` en `dinou.config.js`)

Con la eliminación de Express en favor de los Estándares Web de la W3C, Dinou v7 introduce un sistema de middleware y webhooks universal a través del hook `onRequest(request, context)` en [`dinou.config.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou.config.js):

* **Interceptación y Retorno Temprano (Webhooks y Guards)**:
  El hook recibe el objeto estándar `Request` y el objeto `context` de Dinou. Si el plugin devuelve una instancia nativa de `Response` (por ejemplo `Response.json(...)` o `Response.redirect(...)`), la petición finaliza de inmediato en <1ms sin cargar el árbol de React ni procesar manifiestos.
  - **Webhooks**: Permite recibir y validar firmas criptográficas en bruto (como webhooks de Stripe o Clerk vía Svix) leyendo `await request.text()`.
  - **Protección de Rutas (Route Guards)**: Permite inspeccionar cookies o cabeceras y ejecutar redirecciones tempranas (`Response.redirect(...)`).
* **Enriquecimiento del Contexto (`getContext()`)**:
  Si el plugin no devuelve ninguna `Response`, la petición continúa su flujo normal hacia los Server Components y Server Functions. Cualquier propiedad adjunta a `context` (por ejemplo `context.user = userData` o `context.auth = authData`) queda disponible de forma síncrona en toda la aplicación mediante `getContext()`.
* **100% Portátil**: Funciona exactamente igual en Node.js, Bun, Deno, Cloudflare Workers y Netlify Functions.

---

## 5. Opciones y Guía de Despliegue ("Deploy Everywhere")

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

## 6. La Carpeta Estática Estándar: `public/`

Dinou v7 adopta el estándar de la industria:
- Todo archivo ubicado en `public/` (`favicon.ico`, `robots.txt`, `sitemap.xml`, imágenes, fuentes, etc.) se copia directamente a la raíz pública durante la compilación.
- Se sirve de forma inmediata en la raíz de tu dominio (ejemplo: `public/robots.txt` -> `https://tu-dominio.com/robots.txt`).
- Mantiene compatibilidad transparente con proyectos anteriores que utilicen la carpeta `favicons/`.

---

## 7. Mapa Completo de Scripts en `package.json`

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

## 8. Rendimiento del Motor de Desarrollo (HMR) y la Arquitectura de Caché SWC

### 8.1. El Desafío de Escala en Proyectos Masivos
En aplicaciones de tamaño estándar (20-50 rutas, como `dinou-e2e`), el Hot Module Replacement (HMR) impulsado por `esbuild.context()` es prácticamente instantáneo (**~90 ms - 110 ms**). Sin embargo, al escalar a proyectos de gran envergadura como `dinou-docs` (**163 rutas completas de documentación, 1.107 chunks de salida y 23,5 MB de JavaScript emitido**), el tiempo de reconstrucción se degradaba a **~4.065 ms** (~4 segundos).

### 8.2. Diagnóstico Forense: Los Dos Grandes Cuellos de Botella
Al auditar con precisión el ciclo de vida de reconstrucción en `dinou-docs`, se identificaron dos causas críticas de latencia:
1. **Sobrecarga de Serialización IPC en `build.onLoad`**:
   Para inyectar el runtime de React Fast Refresh, se utilizaba un hook `onLoad` en JavaScript. Cuando un hook en Node.js retorna `contents`, esbuild invalida su caché nativa en Go y se ve obligado a transferir el código completo a través del puente IPC entre Node y Go, forzando a re-parsear el AST de todos los archivos del proyecto en cada guardado.
2. **Avalancha de Resoluciones IPC (13.318 llamadas síncronas)**:
   Un hook `build.onResolve({ filter: /^\./ })` capturaba todos los imports relativos del proyecto, incluyendo los internos de `node_modules` (React, Lucide, componentes UI, resaltadores de sintaxis). Esto disparaba **13.318 cambios de contexto IPC entre Go y Node.js** en cada guardado en Windows, ejecutando miles de comprobaciones síncronas a disco (`fs.statSync`).

### 8.3. La Solución Adoptada: SWC Disk-Mirror (`.dinou/swc/`)
En lugar de transformar el código en memoria dentro del hook `onLoad` de esbuild, se diseñó la arquitectura de **Espejo en Disco con SWC**:
1. **Pre-transformación en Disco (`.dinou/swc/`)**:
   SWC compila los archivos modificados a `.dinou/swc/src/...` con sourcemaps inline y anotaciones de React Fast Refresh en tan solo **~5 ms**.
2. **Caché Nativa de AST en Go**:
   Al apuntar los entrypoints de esbuild directamente a los archivos `.js` generados en `.dinou/swc/`, esbuild los lee directamente de disco con su loader nativo en Go, desbloqueando la caché en memoria de ASTs entre reconstrucciones para todos los módulos que no han cambiado.
3. **Resolución Nativa de Alias con `tsconfigRaw`**:
   En lugar de resolver `@/*` y `~/*` mediante plugins de JavaScript, se inyecta dinámicamente `tsconfigRaw` en la configuración de esbuild mapeando `@/*` a `[".dinou/swc/src/*", "src/*"]`. El motor compilado en Go de esbuild resuelve los alias a nivel nativo en memoria con **cero llamadas a Node.js**.
4. **Filtro Estricto de Assets y Estilos (`asset-extensions.js`)**:
   El hook `onResolve` se acotó estrictamente a extensiones de assets y estilos (`.css`, `.png`, `.svg`, etc.), reutilizando la lista canónica de `dinou/core/asset-extensions.js` con una caché en memoria (`resolveCache`). Las llamadas a Node.js se redujeron de **13.318 a solo 4 llamadas (0 ms)**.

```
[src/ (Tu código)]
  ├── page.tsx  ──────(SWC: Fast Refresh en 5ms)──────>  [.dinou/swc/src/page.js]
  │                                                                 │
  ├── button.tsx ─────(SWC: Fast Refresh en 5ms)──────>  [.dinou/swc/src/button.js]
  │                                                                 │ (esbuild Go lee aquí)
  │                                                                 ▼
  ├── styles.css  <═══════ [swcRedirectPlugin (0ms)] ═══════════════╝ (si page.js pide CSS)
  └── logo.png    <═══════ [swcRedirectPlugin (0ms)] ═══════════════╝ (si page.js pide Asset)
```

### 8.4. Por Qué se Descartó el Pre-bundling de Vendors (`node_modules`)
Durante la investigación se evaluó empaquetar previamente las dependencias de `node_modules` (al estilo de Vite). Se constató que esta vía **no es viable en una arquitectura con React Server Components (RSC)** por cuatro razones técnicas deterministas:
1. **Incompatibilidad de `require()` síncrono en CommonJS**:
   El deserializador cliente de RSC (`@roggc/react-server-dom-esm`) está empaquetado en CommonJS y ejecuta `const React = require("react")`. Si `react` se pre-empaqueta como módulo ESM (`/@deps/react.js`), el navegador no puede ejecutar un `require()` síncrono sobre un módulo ESM externo, lanzando el error fatal: `Dynamic require of "/@deps/react.js" is not supported`.
2. **La Regla del "React Singleton"**:
   React exige una única instancia compartida en memoria en el navegador. Pre-empaquetar ciertas dependencias fuera mientras otras quedan dentro duplica la instancia de React, rompiendo los contextos (`createContext`), los hooks (`Invalid hook call`) y el dispatcher de React Fast Refresh.
3. **Contaminación de Paquetes Híbridos en npm**:
   Al escanear automáticamente `node_modules` para navegador, saltan decenas de errores en librerías que contienen código isomórfico o importan módulos nativos de Node (`fs`, `path`, `assert`, `stream`).
4. **Acoplamiento con el Client Manifest de RSC**:
   El runtime cliente de React 19 debe hidratar el stream de Server Components sincronizándose con los identificadores de chunks del `react-client-manifest.json`, requiriendo un grafo de chunks consistente.

### 8.5. Resultados y Ganancias de Rendimiento
Con esta arquitectura:
* **Proyectos estándar (20-50 rutas)**: Rebuild HMR en **~90 ms - 100 ms**.
* **Proyectos masivos (`dinou-docs`, 163 rutas, 1.107 chunks, 23,5 MB)**:
  - Antes: **4.065 ms** (~4,1 segundos).
  - Después: **~1.100 ms - 1.500 ms** (mejora de casi **4x**).
* **Robustez 100%**: Se preserva la consistencia determinista del grafo completo de esbuild sin recurrir a heurísticas frágiles de micro-compilación.

---

## 9. Conclusión: Independencia, Rendimiento y Futuro

La arquitectura de **Dinou v7** demuestra que es posible disfrutar de toda la potencia de **React 19 (Server Components, Streaming SSR, Server Functions e ISR)** sin renunciar a la libertad de infraestructura:
* **Sin procesos hijos (`fork`)**: Arquitectura AOT unificada, ligera y ultrarrápida.
* **Sin ataduras a proveedores**: La misma aplicación se ejecuta en una función Edge de Cloudflare, en un cluster Kubernetes con Node, en una máquina virtual con Bun o como un binario autocontenido.
* **Desarrollo instantáneo y escalable**: Arquitectura de doble nivel con SWC Disk-Mirror y resolución nativa en Go para un HMR ágil y determinista.
* **Basado en Estándares**: Tu código no depende de APIs propietarias, sino de los estándares web universales de la W3C.
