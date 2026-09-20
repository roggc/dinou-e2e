# Dinou v7 — Arquitectura y Soporte para Cloudflare Workers & Wrangler

Este documento describe detalladamente la arquitectura, soluciones técnicas y modificaciones implementadas en **Dinou v7** para permitir la ejecución y despliegue de **React 19 con React Server Components (RSC) puro y Server Functions** en el runtime de borde de **Cloudflare Workers** utilizando **Wrangler**.

---

## 1. El Desafío: React 19 RSC en Cloudflare Workers

Desplegar React Server Components en un entorno edge como Cloudflare Workers presenta desafíos estructurales importantes:

1. **Sin sistema de archivos físico (`node:fs`)**:
   Cloudflare Workers se ejecuta en el runtime **`workerd`** (basado en aislados V8). No existe un disco físico ni llamadas síncronas tradicionales de archivos. Un framework que busque rutas o páginas dinámicamente en disco falla inmediatamente.
2. **Entorno estricto de ES Modules (ESM)**:
   Los workers se empaquetan como módulos ESM nativos. Variables globales habituales de CommonJS (`__dirname`, `__filename`, `require`) no están disponibles por defecto y arrojan `ReferenceError` si no se tratan adecuadamente.
3. **Manejo de Client Components (`"use client"`) en el servidor Edge**:
   En el renderizado de RSC en Node se suelen usar cargadores dinámicos de módulos. En Cloudflare Workers todo el código debe estar previamente empaquetado en un único bundle estático donde los componentes cliente no se ejecutan como servidor, sino como proxies (`createClientModuleProxy`).
4. **Sin procesos hijos (`child_process`)**:
   Dinou en Node puede emplear forks aislados para el renderizado HTML con SSR. En Edge, todo el pipeline (RSC stream $\to$ HTML stream $\to$ Client Manifest) debe resolverse en el mismo hilo mediante Web Streams (`ReadableStream`).

---

## 2. Arquitectura de la Solución

```
                            [ Petición entrante del Navegador ]
                                             │
                                             ▼
                 ┌────────────────────────────────────────────────────────┐
                 │          Cloudflare Worker (adapters/cloudflare.js)    │
                 │                 fetch(request, env, ctx)               │
                 └───────────────────────────┬────────────────────────────┘
                                             │
             ┌───────────────────────────────┴───────────────────────────────┐
             ▼                                                               ▼
   ¿Es Activo Estático / SSG?                                      ¿Es Ruta Dinámica / RSC / SF?
             │                                                               │
             ▼                                                               ▼
┌─────────────────────────┐                                    ┌───────────────────────────┐
│     env.ASSETS.fetch    │                                    │  Dinou Edge Request Handler│
│ (HTML pre-renderizado,  │                                    │  - VFS Router en memoria  │
│  .rsc estático, JS/CSS) │                                    │  - react-server-dom.edge  │
└─────────────────────────┘                                    │  - Cloudflare KV Cache    │
                                                               └───────────────────────────┘
```

---

## 3. Componentes y Modificaciones Clave

### 3.1. Adaptador Nativo de Cloudflare (`dinou/adapters/cloudflare.js`)
Punto de entrada compatible con la API estándar de Cloudflare Workers:
* **Intercepción de `env.ASSETS`**: Antes de invocar cómputo en el worker, evalúa si la petición corresponde a:
  * Recursos estáticos (bundles de JS, CSS, imágenes).
  * Páginas HTML pre-generadas por SSG (`.dinou/dist2` sincronizado en `.dinou/dist3`).
  * Payloads de RSC pre-renderizados (`/____rsc_payload____/...` mapeados a `rsc.rsc`).
* **Soporte de ISR con Cloudflare KV**: Permite configurar `env.DINOU_CACHE` para persistir y revalidar rutas en Edge Storage mediante `CloudflareKVStorage`.
* **Delegación a `handleRequest`**: Pasa la petición al núcleo de Dinou con el contexto `runtime: "edge"`.

### 3.2. Pipeline de Compilación Edge (`dinou/cloudflare/build.mjs`)
Script que genera y empaqueta el worker para producción:
1. **Generación estática de rutas (`route-modules.js`)**:
   Analiza el directorio `src/` en tiempo de compilación y genera un archivo con imports estáticos de todas las páginas, layouts y componentes de error, evitando la necesidad de descubrirlos en caliente.
2. **Sincronización SSG**:
   Copia el contenido pre-renderizado de `.dinou/dist2` a `.dinou/dist3` para que Wrangler lo sirva directamente a través de `env.ASSETS`.
3. **Virtual File System (VFS) en memoria (`env-setup.js`)**:
   Genera una instantánea de la jerarquía de `src/` y la inyecta en `globalThis.__DINOU_VFS__`.
4. **Inyección de Manifiestos de Cliente y Funciones Servidor**:
   Lee los manifiestos `react-client-manifest.json` y `server-functions-manifest.json` e inicializa:
   * `globalThis.__DINOU_CLIENT_MANIFEST__`
   * `globalThis.__DINOU_SERVER_FUNCTIONS_MANIFEST__`
   Normaliza las rutas y prefijos de archivos de Windows/POSIX (`file:///C:/` vs `file:///c:/`).

### 3.3. Transformación de `"use client"` (`clientReferencesPlugin`)
Durante el bundling con esbuild, un plugin detecta los archivos con la directiva `"use client"` y los transforma en proxies ligeros:
```javascript
import { createClientModuleProxy } from "react-server-dom-webpack/server.edge";
const proxy = createClientModuleProxy(fileUrl);
export default proxy.default;
export const MiComponente = proxy["MiComponente"];
```
Esto permite a `react-server-dom-webpack/server.edge` emitir las referencias correctas en el payload RSC sin intentar ejecutar código del cliente en el worker.

### 3.4. Shims de Compatibilidad de Node.js (`dinou/cloudflare/shims/`)
* **`fs.js`**: Implementa `existsSync`, `readdirSync`, `readFileSync` y `statSync` consultando el snapshot del VFS en memoria (`globalThis.__DINOU_VFS__`).
* **`child_process.js`**: Provee stubs no-op para evitar errores de enlace en caso de que librerías compartidas requieran `fork` o `spawn`.
* **Módulos vacíos**: Se enlazan a `empty.js` módulos no soportados en edge (`net`, `tls`, `http`, `https`, `cluster`, `dgram`, `dns`).

### 3.5. Banner de Protección para ES Modules
En la configuración de esbuild se añadió un `banner` en la cabecera del bundle:
```javascript
banner: {
  js: "import { createRequire as ___createRequire } from 'node:module'; const require = ___createRequire(import.meta.url || 'file:///worker.js'); const __dirname = ''; const __filename = ''; globalThis.__dinou_require__ = require;",
}
```
Esto evita fallos de tipo `ReferenceError: __dirname is not defined` o `ReferenceError: require is not defined` cuando dependencias o utilidades internas intentan evaluar variables globales de CJS.

### 3.6. Protección en `dinou/core/dinou-paths.js`
Se adaptó la resolución del core para entornos edge:
```javascript
function getDinouCoreDir() {
  if (typeof process !== "undefined" && process.env && process.env.DINOU_RUNTIME === "edge") {
    return "/dinou/core";
  }
  // ... resolución normal en Node protegida con typeof __dirname !== "undefined"
}
```
Al compilar con `define: { "process.env.DINOU_RUNTIME": '"edge"' }`, esbuild evalúa esto estáticamente y elimina cualquier llamada innecesaria al disco físico.

---

## 4. Configuración de Wrangler (`wrangler.toml`)

La configuración recomendada en la raíz del proyecto para Wrangler v4 es:

```toml
name = "dinou-cloudflare-app"
main = ".dinou/cloudflare/worker.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".dinou/dist3"
binding = "ASSETS"
html_handling = "auto-trailing-slash"

# Opcional: habilitar KV para caché de ISR
# [[kv_namespaces]]
# binding = "DINOU_CACHE"
# id = "<ID_DEL_NAMESPACE_KV>"
```

---

## 5. Comandos de Compilación y Ejecución

1. **Construir para Cloudflare**:
   ```bash
   npm run build:cloudflare
   # Equivale a: npm run build && node ./dinou/cloudflare/build.mjs
   ```
2. **Probar localmente con Wrangler Dev**:
   ```bash
   npx wrangler dev
   ```
3. **Desplegar a producción en Cloudflare**:
   ```bash
   npx wrangler deploy
   ```

---

## 6. Resumen de Ventajas Técnicas

* **Bundle ultracompacto**: El worker resultante ronda los **~500 KB**, arrancando instantáneamente sin latencia de cold-start.
* **Separación óptima**: El tráfico estático (HTML generado, CSS, JS e imágenes) se entrega directamente desde la red global de Cloudflare (`env.ASSETS`), reservando el cómputo del Worker únicamente para renderizado dinámico, rutas dinámicas y Server Functions.
* **Independencia del Empaquetador**: El proyecto puede construirse con `esbuild`, `rollup` o `webpack` antes de empaquetar el worker final.
