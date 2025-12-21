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
            let isRedirecting = false; // 🚩 Bandera nueva

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });

              // LÓGICA DE SCRIPTS
              if (chunk.includes("<script>")) {
                const scriptRegex = /<script>(.*?)<\/script>/gs;
                const scriptsFound = chunk.match(scriptRegex);

                if (scriptsFound) {
                  scriptsFound.forEach((scriptTag) => {
                    // Detectar si es un redirect
                    if (scriptTag.includes("window.location.href")) {
                      isRedirecting = true; // 🚩 Marcamos que nos vamos
                    }

                    const range = document.createRange();
                    const fragment = range.createContextualFragment(scriptTag);
                    document.body.appendChild(fragment);
                  });
                }

                const cleanChunk = chunk.replace(scriptRegex, "");
                if (cleanChunk.trim()) {
                  controller.enqueue(encoder.encode(cleanChunk));
                }
              } else {
                controller.enqueue(value);
              }
            }

            // 💡 EL TRUCO FINAL:
            // Si estamos redirigiendo, NO cerramos el controller.
            // Dejamos a React esperando (Pending) hasta que el navegador cambie de página.
            // Esto evita el "Connection closed error".
            if (!isRedirecting) {
              controller.close();
            }
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
