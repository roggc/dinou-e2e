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

              // 💡 EJECUCIÓN SEGURA SIN EVAL
              if (chunk.includes("<script>")) {
                // 1. Ejecutamos el script en el navegador
                const range = document.createRange();
                const fragment = range.createContextualFragment(chunk);
                document.body.appendChild(fragment);

                // 2. LIMPIAMOS el chunk para React
                // Eliminamos las etiquetas script para que no corrompan el protocolo RSC
                const cleanChunk = chunk.replace(
                  /<script.*?>.*?<\/script>/gs,
                  ""
                );

                if (cleanChunk.trim()) {
                  controller.enqueue(encoder.encode(cleanChunk));
                }
              } else {
                // Si no hay scripts, pasamos el valor original (más eficiente)
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
