// public/server-function-proxy.js
import { createFromFetch } from "@roggc/react-server-dom-esm/client";

export function createServerFunctionProxy(id) {
  return new Proxy(() => {}, {
    apply: async (_target, _thisArg, args) => {
      const res = await fetch("/____server_function____", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-server-function-call": "1",
        },
        body: JSON.stringify({ id, args }),
      });
      if (!res.ok) throw new Error("Server function failed");

      const contentType = res.headers.get("content-type") || "";

      // 💡 NUEVA CONDICIÓN PARA HTML (REDIRECTS)
      if (contentType.includes("text/html")) {
        const html = await res.text();

        // Creamos un fragmento y forzamos la ejecución de los scripts
        const range = document.createRange();
        const documentFragment = range.createContextualFragment(html);
        document.body.appendChild(documentFragment);

        // Retornamos una promesa que nunca se resuelve porque el navegador va a cambiar de página
        return new Promise(() => {});
      }

      if (contentType.includes("text/x-component")) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();

        const readableStream = new ReadableStream({
          async start(controller) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });

              // // 💡 EJECUCIÓN SEGURA Y PRECISA
              // if (chunk.includes("<script>")) {
              //   // 1. Extraer SOLO los scripts para ejecutarlos
              //   // Usamos un regex para encontrar todos los bloques de script
              //   const scriptRegex = /<script>(.*?)<\/script>/gs;
              //   let match;

              //   while ((match = scriptRegex.exec(chunk)) !== null) {
              //     const scriptContent = match[1];
              //     // Ejecutamos solo el contenido del script de forma segura
              //     try {
              //       // Opción A: new Function (más limpio que appendChild para JS puro)
              //       // new Function(scriptContent)();

              //       // Opción B: Si prefieres appendChild, crea un script tag limpio
              //       const scriptEl = document.createElement("script");
              //       scriptEl.text = scriptContent;
              //       document.body.appendChild(scriptEl);
              //       document.body.removeChild(scriptEl); // Limpieza inmediata
              //     } catch (err) {
              //       console.error("Error executing injected script:", err);
              //     }
              //   }

              //   // 2. LIMPIAMOS el chunk para React
              //   // Eliminamos las etiquetas script completas
              //   const cleanChunk = chunk.replace(
              //     /<script.*?>.*?<\/script>/gs,
              //     ""
              //   );

              //   if (cleanChunk.trim()) {
              //     controller.enqueue(encoder.encode(cleanChunk));
              //   }
              // } else {
              //   // Si no hay scripts, pasamos el valor original
              //   controller.enqueue(value);
              // }

              // 💡 LÓGICA CORREGIDA: Separar ejecución de limpieza
              if (chunk.includes("<script>")) {
                // 1. Extraer SOLO los scripts para el DOM
                const scriptRegex = /<script>(.*?)<\/script>/gs;
                const scriptsFound = chunk.match(scriptRegex);

                if (scriptsFound) {
                  scriptsFound.forEach((scriptTag) => {
                    // console.log("Injecting script tag:", scriptTag);
                    // Creamos un fragmento SOLO con el script, ignorando el texto RSC
                    const range = document.createRange();
                    const fragment = range.createContextualFragment(scriptTag);
                    document.body.appendChild(fragment);
                  });
                }

                // 2. Limpiar el chunk para pasárselo a React
                const cleanChunk = chunk.replace(scriptRegex, "");

                // Solo encolamos si queda algo (el payload RSC)
                if (cleanChunk.trim()) {
                  controller.enqueue(encoder.encode(cleanChunk));
                }
              } else {
                // Si no hay scripts, es payload puro de React
                controller.enqueue(value);
              }
            }
            controller.close();
          },
        });
        // return createFromFetch(Promise.resolve(res));
        return createFromFetch(Promise.resolve(new Response(readableStream)));
      } else {
        return res.json();
      }
    },
  });
}
