const path = require("path");
const { mkdirSync, createWriteStream } = require("fs");
const fs = require("fs").promises; // Necesario para operaciones asíncronas (rename, unlink, readFile, writeFile)
const renderAppToHtml = require("./render-app-to-html.js");
const getSSGMetadata = require("./get-ssg-metadata.js");

const OUT_DIR = path.resolve("dist2");
const MANIFEST_PATH = path.join(OUT_DIR, "status-manifest.json");

/**
 * Helper para actualizar el manifiesto de estados de forma segura.
 * Se asegura de leer el estado actual del disco antes de escribir.
 */
async function updateStatusManifest(reqPath, status) {
  try {
    let manifest = {};
    // 1. Intentamos leer el manifiesto actual
    try {
      const content = await fs.readFile(MANIFEST_PATH, "utf-8");
      manifest = JSON.parse(content);
    } catch (e) {
      // Si no existe o falla el parseo, empezamos con objeto vacío
      // (aunque en producción debería existir desde el build time)
    }

    // 2. Comprobar si hay cambio real para evitar escrituras innecesarias
    const currentStatus = manifest[reqPath]?.status;
    if (currentStatus === status) return;

    // 3. Actualizar y guardar en disco
    manifest[reqPath] = { status };
    await fs.writeFile(
      MANIFEST_PATH,
      JSON.stringify(manifest, null, 2),
      "utf-8"
    );
    console.log(
      `[ISR] Manifest updated for ${reqPath}: ${currentStatus} -> ${status}`
    );
  } catch (error) {
    console.error(`[ISR] Failed to update manifest for ${reqPath}:`, error);
  }
}

async function generateStaticPage(reqPath) {
  // Normalización de la ruta
  const finalReqPath = reqPath.endsWith("/") ? reqPath : reqPath + "/";

  // 1. RUTAS: Definimos la ruta final y la TEMPORAL
  // Usamos un archivo .tmp para evitar corromper el index.html actual si falla el renderizado
  const htmlPath = path.join(OUT_DIR, finalReqPath, "index.html");
  const tempHtmlPath = path.join(OUT_DIR, finalReqPath, "index.html.tmp");

  const query = {};
  const paramsString = JSON.stringify(query);
  const capturedStatus = {}; // Objeto por referencia para capturar el status del hijo

  // MOCK REQUEST (Contexto necesario para SSR)
  const contextForChild = {
    req: {
      query: query,
      cookies: {},
      headers: {
        "user-agent": "Dinou-ISR-Revalidator",
        host: "localhost",
        "x-forwarded-proto": "http",
      },
      path: finalReqPath,
      method: "GET",
    },
  };

  try {
    // Aseguramos que el directorio exista
    mkdirSync(path.dirname(htmlPath), { recursive: true });

    // 2. STREAM: Escribimos en el archivo TEMPORAL (.tmp)
    const fileStream = createWriteStream(tempHtmlPath);
    let htmlStream = null;

    // MOCK RESPONSE (Simulación de Express + Fix Webpack + Captura Status)
    const mockRes = {
      headersSent: true, // Forzamos modo "streaming/script injection"
      _cookies: [], // Opcional: para debug

      // Soporte para cookies (ignoradas en salida pero capturadas en log)
      cookie(name, value, options) {
        this._cookies.push({ name, value, options });
      },

      write: (chunk) => {
        if (!fileStream.writableEnded) fileStream.write(chunk);
      },

      end: (chunk) => {
        if (chunk && !fileStream.writableEnded) fileStream.write(chunk);

        // 🔥 FIX WEBPACK "WRITE AFTER END":
        // Desconectamos el stream del hijo inmediatamente.
        if (htmlStream) {
          htmlStream.unpipe(fileStream);
        }

        if (!fileStream.writableEnded) fileStream.end();
      },

      status: (code) => {
        // Capturamos el status que nos envía el proceso hijo
        capturedStatus.value = code;
        if (code !== 200) {
          // console.warn(`[ISR Warning] Status ${code} detected for ${finalReqPath}`);
        }
      },

      // Stubs para métodos que no aplican en ISR o headersSent=true
      setHeader: () => {},
      clearCookie: () => {},
      redirect: () => {},
    };

    // 3. Ejecutar Renderizado
    htmlStream = renderAppToHtml(
      finalReqPath,
      paramsString,
      "{}",
      contextForChild,
      mockRes,
      capturedStatus
    );

    const sideEffectScripts = getSSGMetadata(reqPath);

    await new Promise((resolve, reject) => {
      // Inyección de Scripts (CSS, JS chunks)
      if (sideEffectScripts) {
        fileStream.write(sideEffectScripts);
      }

      // Conectamos standard output al archivo temporal
      htmlStream.pipe(fileStream, { end: false });

      // Manejo de eventos
      htmlStream.on("end", () => {
        if (!fileStream.writableEnded) fileStream.end();
        resolve();
      });

      htmlStream.on("error", (err) => {
        // Si falla el stream, cerramos el archivo y borramos el temporal
        fileStream.end();
        fs.unlink(tempHtmlPath).catch(() => {});

        // Ignoramos el error de carrera de Webpack si ocurre
        if (err.code === "ERR_STREAM_WRITE_AFTER_END") {
          resolve();
        } else {
          reject(err);
        }
      });

      fileStream.on("error", reject);
    });

    // =========================================================
    // 🛡️ LÓGICA DE PROTECCIÓN ISR & ACTUALIZACIÓN ATÓMICA
    // =========================================================

    // CASO A: Fallo Crítico (500)
    // Si la regeneración falló, NO sobrescribimos la caché válida existente.
    if (capturedStatus.value === 500) {
      console.warn(
        `[ISR] Revalidation failed (500) for ${finalReqPath}. Discarding changes & keeping old cache.`
      );
      // Borramos el archivo temporal que contiene la página de error
      await fs.unlink(tempHtmlPath).catch(() => {});
      return; // Salimos sin actualizar nada más
    }

    // CASO B: Éxito (200, 404, Redirects)
    // 🔄 RENOMBRADO ATÓMICO: Convertimos el .tmp en el .html real.
    // Esto es casi instantáneo y evita archivos corruptos o a medio escribir.
    await fs.rename(tempHtmlPath, htmlPath);

    // Actualizamos el manifiesto con el nuevo status
    // Si capturedStatus.value es undefined, asumimos 200 (éxito por defecto)
    const finalStatus = capturedStatus.value || 200;
    await updateStatusManifest(finalReqPath, finalStatus);

    console.log(
      `✅ ISR Complete: ${finalReqPath} (Updated to Status: ${finalStatus})`
    );
  } catch (error) {
    // Limpieza de seguridad en caso de excepción no controlada
    await fs.unlink(tempHtmlPath).catch(() => {});

    if (error.code === "ERR_STREAM_WRITE_AFTER_END") {
      console.log(
        "⚠️ Ignored write-after-end race condition for:",
        finalReqPath
      );
    } else {
      console.error("❌ ISR Error rendering:", finalReqPath);
      console.error(error.message);
    }
  }
}

module.exports = generateStaticPage;
