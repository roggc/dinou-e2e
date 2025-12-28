import { use, useState, useEffect, startTransition } from "react";
import { createFromFetch } from "@roggc/react-server-dom-esm/client";
import { hydrateRoot } from "react-dom/client";

// Caché global para no volver a pedir payloads de rutas ya visitadas
const cache = new Map();

// Función auxiliar para calcular la ruta relativa actual
const getCurrentRoute = () => window.location.pathname + window.location.search;

function Router() {
  // 1. Estado que controla la URL actual
  const [route, setRoute] = useState(getCurrentRoute());

  // 2. Efecto para interceptar clicks en enlaces <a>
  useEffect(() => {
    const onNavigate = (e) => {
      // Buscamos si el click fue en un <a> o dentro de uno
      const anchor = e.target.closest("a");

      // Si no es un enlace, o tiene target blank, o teclas modificadoras, ignoramos
      if (
        !anchor ||
        anchor.target ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      // Verificamos que sea un enlace interno (mismo dominio)
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/")) return;

      // 🛑 PREVENIMOS LA RECARGA DEL NAVEGADOR
      e.preventDefault();

      // Cambiamos la URL en la barra de direcciones sin recargar
      window.history.pushState(null, "", href);

      // Usamos startTransition para que la UI no se bloquee mientras llega el payload
      startTransition(() => {
        setRoute(href);
      });
    };

    // 3. Efecto para manejar los botones Atrás/Adelante del navegador
    const onPopState = () => {
      startTransition(() => {
        setRoute(getCurrentRoute());
      });
    };

    window.addEventListener("click", onNavigate);
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("click", onNavigate);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    document.body.setAttribute("data-hydrated", "true");
  }, []);

  // 4. Lógica de Obtención de Datos (RSC)
  let content = cache.get(route);

  // Si no está en caché, pedimos el Payload
  if (!content) {
    const payloadUrl = window.__DINOU_USE_OLD_RSC__
      ? "/____rsc_payload_old____" + route
      : "/____rsc_payload____" + route;

    content = createFromFetch(fetch(payloadUrl));
    cache.set(route, content);
  }

  // 5. Renderizamos el árbol RSC
  // Nota: Al cambiar 'route', React recibe un nuevo árbol.
  // React compara el nuevo con el viejo. Si el Layout es el mismo, MANTIENE EL ESTADO.
  return use(content);
}

// Hidratamos una sola vez con el Router
hydrateRoot(document, <Router />);

// HMR
if (import.meta.hot) {
  import.meta.hot.accept();
}
