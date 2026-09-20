# Dinou v7: Despliegue Universal ("Deploy Everywhere")

## 1. Visión y Objetivo de Dinou v7

Durante años, los frameworks modernos de React han pecado de un grave problema de la industria: el **acoplamiento propietario (*vendor lock-in*)**. Muchas de las mejores características de React 19 (Server Components, Streaming SSR, Server Actions e ISR) parecían estar diseñadas para funcionar de forma óptima únicamente en plataformas de alojamiento específicas.

El gran objetivo arquitectónico de **Dinou v7** ha sido romper esa barrera: **hacer que una aplicación React 19 con Server Components pueda desplegarse literalmente en cualquier infraestructura de hosting existente en el mundo**, desde un servidor VPS de 3€ hasta las redes Edge descentralizadas más avanzadas o un hosting 100% estático gratuito.

### El pilar fundamental: Estándares Web de la W3C
Para lograr la independencia total de plataforma, el motor de Dinou (`handleRequest`) se desacopló por completo de APIs de sistemas operativos específicos o de librerías como Express. Todo el núcleo de Dinou opera exclusivamente sobre estándares web abiertos:
- Objetos nativos `Request` y `Response`.
- Streaming reactivo asíncrono con `ReadableStream` para React Server Components.
- Manejo universal de `Headers`, `Cookies` y `URL`.

Gracias a esto, Dinou ya no es un framework dependiente de Node.js: es un **motor universal de React 19** que se ejecuta de forma nativa dondequiera que exista JavaScript o TypeScript.

---

## 2. Los 5 Paradigmas de Despliegue Soportados

Dinou v7 cubre de forma nativa los 5 paradigmas de computación web actuales:

| Paradigma | Runtimes / Plataformas | Características en Dinou |
| :--- | :--- | :--- |
| **A. Runtimes Modernos Alternativos** | **Bun** | Streaming estático *zero-copy* a nivel de kernel (`Bun.file`) y servidor HTTP ultra-rápido en C++. |
| **B. Servidores y Contenedores** | **Node.js** y **Deno Standalone** | Despliegue en Docker, Kubernetes, VPS (Hetzner, OVH, DigitalOcean) o PaaS (Render, Fly.io, Railway). |
| **C. Redes Edge y Serverless** | **Cloudflare Workers/Pages**, **Deno Deploy** y **Netlify** | Ejecución distribuida en Edge y funciones Serverless v2 con estándares web. |
| **D. Almacenamiento Distribuido (ISR/ISG)** | **Cloudflare KV**, **Deno KV** y **Redis** | Regeneración estática incremental sin necesidad de disco físico. |
| **E. Hosting 100% Estático (SSG)** | **Surge.sh**, **GitHub Pages**, AWS S3, Firebase Hosting | Exportación a carpeta `out/` autocontenida con pre-renderizado completo de páginas y payloads RSC. |

---

## 3. Arquitectura de Dos Capas: Compilación y Adaptador Edge

En aplicaciones tradicionales con Server Components, compilar para entornos Serverless/Edge solía ser complejo porque los Workers carecen de un sistema de archivos tradicional persistente (`fs`) y de la carpeta `node_modules`.

Dinou v7 resuelve esto mediante una arquitectura limpia de dos fases:

1. **Fase 1: Compilación de la Aplicación (`npm run build`)**  
   Procesa los componentes cliente (`"use client"`), CSS, TypeScript y genera los bundles optimizados con hashes en `.dinou/dist3/`, así como las páginas pre-renderizadas en `.dinou/dist2/`. Dinou permite elegir entre **Esbuild**, **Rollup** o **Webpack**.
2. **Fase 2: El Linker de Adaptador Edge (`build:cloudflare` o `build:deno`)**  
   Inyecta en memoria las rutas de la aplicación (`route-modules.js`) y los manifiestos de RSC (`__DINOU_CLIENT_MANIFEST__` y `__DINOU_SERVER_FUNCTIONS_MANIFEST__`), empaquetando un único archivo ESM standalone (`worker.js` o `main.js`) listo para desplegar.

---

## 4. Guía Práctica de Despliegue Paso a Paso

### A. Despliegue en Bun (VPS o Docker)
Bun es ideal si buscas el máximo rendimiento en un servidor propio con un consumo mínimo de CPU y RAM.

1. Compila la aplicación:
   ```bash
   npm run build
   ```
2. Arranca el servidor de Bun:
   ```bash
   npm run start:bun
   # o directamente: bun dinou/adapters/bun.js
   ```
   *Puerto por defecto: `3000` (configurable con la variable de entorno `PORT`).*

---

### B. Despliegue en Deno Standalone (VPS o Contenedor)
Aprovecha la seguridad por defecto y el soporte nativo de TypeScript de Deno.

1. Compila la aplicación:
   ```bash
   npm run build
   ```
2. Arranca con permisos explícitos de red, lectura y entorno:
   ```bash
   npm run start:deno
   # o directamente: deno run --allow-net --allow-read --allow-env dinou/adapters/deno.js
   ```

---

### C. Despliegue en Deno Deploy (Edge Global)
Deno Deploy ejecuta tu app en la red global de Deno con 1.000.000 de peticiones al mes gratuitas.

1. Genera el bundle Edge en un solo paso:
   ```bash
   npm run build:deno
   ```
   *(Este comando compila automáticamente los assets y genera el archivo standalone `.dinou/deno/main.js`)*.
2. Despliega con la CLI de Deno Deploy:
   ```bash
   deployctl deploy --project=<tu-proyecto> .dinou/deno/main.js
   ```
   *Nota: Si tu aplicación utiliza ISR (Incremental Static Regeneration), Dinou activará automáticamente `DenoKVStorage` usando la base de datos distribuida global Deno KV sin requerir ninguna configuración extra.*

---

### D. Despliegue en Cloudflare Workers / Cloudflare Pages
Despliega en la infraestructura Edge de Cloudflare con 100.000 peticiones diarias gratis.

1. Genera el bundle Edge:
   ```bash
   npm run build:cloudflare
   ```
   *(Genera `.dinou/cloudflare/worker.js` listo para Cloudflare)*.
2. Despliega con Wrangler:
   ```bash
   npx wrangler deploy
   ```

---

### E. Despliegue en DigitalOcean (DO)
DigitalOcean ofrece dos excelentes alternativas para alojar aplicaciones Dinou:

#### 1. DigitalOcean App Platform (PaaS Totalmente Administrado)
Despliegue automático conectado directamente a tu repositorio de GitHub, sin gestionar servidores:
- **Build Command**: `npm run build`
- **Run Command**: `npm start` (o `npm run start:bun` si utilizas un Dockerfile con Bun)
- **HTTP Port**: `3000` (Dinou detecta automáticamente la variable de entorno `PORT` inyectada por DigitalOcean).
- Despliegues continuos automáticos con cada `git push` y certificados SSL gratuitos.

#### 2. DigitalOcean Droplets (VPS Tradicional con Linux / Docker / PM2)
Si prefieres un servidor VPS propio (a partir de $4-$6/mes) con control total y almacenamiento en disco persistente (`FileSystemStorage`):
```bash
# En tu Droplet (Ubuntu/Debian):
npm ci
npm run build
pm2 start npm --name "dinou-app" -- start
```
*(O ejecutando tu contenedor Docker con `docker run -d -p 80:3000 mi-dinou-app`)*.

---

### F. Despliegue en Netlify (Functions v2)
Dinou incluye un adaptador nativo oficial para Netlify Functions v2 ([`dinou/adapters/netlify.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/adapters/netlify.js)), operando sobre estándares web W3C:

1. Crea el archivo `netlify/functions/dinou.js` en tu proyecto:
   ```javascript
   export { default, config } from "dinou/adapters/netlify";
   ```
2. Configura tu archivo `netlify.toml` en la raíz:
   ```toml
   [build]
     command = "npm run build"
     publish = ".dinou/dist3"

   [functions]
     directory = "netlify/functions"
   ```
   *Nota: Gracias a la directiva `preferStatic: true` integrada en el adaptador, Netlify sirve automáticamente todos los assets de cliente de `.dinou/dist3` directamente desde su CDN global, y enruta únicamente las peticiones de SSR y Server Functions a la función serverless.*

---

### G. Despliegue en Hosting 100% Estático (Surge.sh / GitHub Pages / DO Spaces)
Si tu aplicación utiliza Static Site Generation (SSG) y no requiere SSR dinámico en el servidor, puedes exportarla como un sitio estático puro a coste 0.

1. Genera la exportación estática:
   ```bash
   npm run export-static
   ```
   *(Dinou compila la aplicación y unifica los bundles de `.dinou/dist3` y los HTML pre-renderizados de `.dinou/dist2` en una carpeta limpia `out/`)*.
2. Despliega la carpeta `out/`:
   - **En Surge.sh:**
     ```bash
     npx surge out tu-dominio.surge.sh
     ```
   - **En GitHub Pages:**
     ```bash
     npx gh-pages -d out
     ```
   - **En Cloudflare Pages (Static Direct Upload):**
     ```bash
     npx wrangler pages deploy out
     ```
   - **En DigitalOcean Spaces (S3 compatible con CDN):**
     Subiendo el contenido de `out/` a tu Bucket de Spaces con CDN activado.

---

## 5. La Carpeta Estática Estándar: `public/`

A partir de la versión 7, Dinou adopta el estándar universal de la industria para archivos estáticos no procesados: **la carpeta `public/` en la raíz del proyecto**.

- **¿Para qué sirve?**: Cualquier archivo colocado en `public/` (`favicon.ico`, `robots.txt`, `sitemap.xml`, `site.webmanifest`, imágenes directas) se copia automáticamente a la raíz de `.dinou/dist3/` durante el build.
- **Acceso en el navegador**: Se sirve directamente desde la URL raíz (por ejemplo, `public/robots.txt` se sirve en `https://tu-dominio.com/robots.txt`).
- **Retrocompatibilidad**: Dinou mantiene compatibilidad total con proyectos anteriores que aún utilicen la carpeta `favicons/`.

---

## 6. Resumen de Scripts de Despliegue en `package.json`

Dinou v7 estructura sus comandos de forma clara y modular por familias:

```json
{
  "scripts": {
    "// --- Runtimes Standalone ---": "",
    "start": "npm run start:esbuild",
    "start:bun": "bun dinou/adapters/bun.js",
    "start:deno": "deno run --allow-net --allow-read --allow-env dinou/adapters/deno.js",

    "// --- Edge Builds (Cloudflare & Deno Deploy) ---": "",
    "build:cloudflare": "npm run build && node ./dinou/cloudflare/build.mjs",
    "build:cloudflare:rollup": "npm run build:rollup && node ./dinou/cloudflare/build.mjs",
    "build:cloudflare:webpack": "npm run build:webpack && node ./dinou/cloudflare/build.mjs",

    "build:deno": "npm run build && node ./dinou/deno/build.mjs",
    "build:deno:rollup": "npm run build:rollup && node ./dinou/deno/build.mjs",
    "build:deno:webpack": "npm run build:webpack && node ./dinou/deno/build.mjs",

    "// --- Static Site Export (Surge, GitHub Pages, S3) ---": "",
    "export-static": "npm run export-static:esbuild",
    "export-static:esbuild": "npm run build:esbuild && node ./dinou/core/export-static.mjs",
    "export-static:rollup": "npm run build:rollup && node ./dinou/core/export-static.mjs",
    "export-static:webpack": "npm run build:webpack && node ./dinou/core/export-static.mjs"
  }
}
```

---

## 7. Conclusión: Libertad Total de Elección

Con Dinou v7 ya no tienes que adaptar tu arquitectura a las exigencias o tarifas de un proveedor de hosting. Puedes:
- Empezar gratis en **GitHub Pages** o **Surge.sh** con `export-static`.
- Escalar a nivel global con latencia cero en **Cloudflare Workers** o **Deno Deploy** a coste 0€.
- O desplegar con máximo control y rendimiento en **DigitalOcean** (App Platform o Droplets), **Bun** o **Docker**.

Tu código sigue siendo exactamente el mismo. Dinou se encarga del resto.
