// dinou/core/client.jsx
import {
  use,
  useState,
  useEffect,
  useTransition,
  useLayoutEffect,
  useMemo, // 1. Añadimos useMemo
} from "react";
import { createFromFetch } from "@roggc/react-server-dom-esm/client";
import { hydrateRoot } from "react-dom/client";
import { RouterContext } from "./navigation.js";

const cache = new Map();
const scrollCache = new Map();

const getCurrentRoute = () => window.location.pathname + window.location.search;

function Router() {
  const [route, setRoute] = useState(getCurrentRoute());
  const [isPopState, setIsPopState] = useState(false);
  // ⚡️ HOOK DE TRANSICIÓN
  // isPending será true mientras React espera el fetch del RSC y el renderizado
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    document.body.setAttribute("data-hydrated", "true");
  }, []);

  // ⚡️ FUNCIÓN: navigate
  // Maneja la navegación programática y la actualización del historial
  const navigate = (href, options = {}) => {
    let finalPath;

    // 1. Resolución de Ruta Relativa (Modo Directorio)
    if (!href.startsWith("/") && !href.includes("://")) {
      let base = window.location.pathname;
      if (!base.endsWith("/")) base += "/";
      const resolved = new URL(href, window.location.origin + base);
      finalPath = resolved.pathname + resolved.search + resolved.hash;
    } else {
      const resolved = new URL(href, window.location.origin);
      finalPath = resolved.pathname + resolved.search + resolved.hash;
    }

    // 2. Normalización de Trailing Slash para consistencia en URL y Cache
    // Evita que "/home/" y "/home" se traten como rutas distintas
    if (
      finalPath.length > 1 &&
      finalPath.endsWith("/") &&
      !finalPath.includes("?") &&
      !finalPath.includes("#")
    ) {
      finalPath = finalPath.slice(0, -1);
    }

    // 3. Gestión de Scroll y Estado
    scrollCache.set(
      window.location.pathname + window.location.search,
      window.scrollY
    );

    if (options.replace) {
      window.history.replaceState(null, "", finalPath);
    } else {
      window.history.pushState(null, "", finalPath);
    }

    startTransition(() => {
      setIsPopState(false);
      setRoute(finalPath);
    });
  };

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    // ⚡️ INTERCEPTOR: onNavigate (dentro del useEffect)
    const onNavigate = (e) => {
      const anchor = e.target.closest("a");
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

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("mailto:") || href.startsWith("tel:"))
        return;

      // 1. Calcular la ruta destino final (aplicando lógica de directorio si es relativa)
      let finalPath;
      if (!href.startsWith("/") && !href.includes("://")) {
        let base = window.location.pathname;
        if (!base.endsWith("/")) base += "/";
        const resolvedUrl = new URL(href, window.location.origin + base);
        finalPath =
          resolvedUrl.pathname + resolvedUrl.search + resolvedUrl.hash;
      } else {
        const targetUrl = new URL(anchor.href);
        if (targetUrl.origin !== window.location.origin) return; // Enlace externo
        finalPath = targetUrl.pathname + targetUrl.search + targetUrl.hash;
      }

      // 2. Verificación de "Misma Página" para evitar RSC Fetch en saltos de Hash (#)
      // Comparamos los pathnames normalizados (sin la barra final virtual)
      const normalize = (p) =>
        p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;

      const targetUrlObj = new URL(finalPath, window.location.origin);
      const targetPathClean = normalize(targetUrlObj.pathname);
      const currentPathClean = normalize(window.location.pathname);

      if (
        targetPathClean + targetUrlObj.search ===
          currentPathClean + window.location.search &&
        targetUrlObj.hash
      ) {
        // Es un salto de hash en la misma página:
        // Dejamos que el navegador actúe de forma nativa (NO preventDefault, NO navigate)
        return;
      }

      // 3. Ejecutar navegación SPA
      e.preventDefault();
      navigate(finalPath);
    };

    const onPopState = () => {
      startTransition(() => {
        setIsPopState(true);
        setRoute(getCurrentRoute());
      });
    };

    window.addEventListener("click", onNavigate);
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("click", onNavigate);
      window.removeEventListener("popstate", onPopState);
    };
  }, []); // Dependencias vacías, navigate es estable dentro del closure, pero mejor así.

  useLayoutEffect(() => {
    requestAnimationFrame(() => {
      if (window.location.hash) return;

      if (isPopState) {
        const key = route;
        const savedY = scrollCache.get(key);
        if (savedY !== undefined) {
          window.scrollTo(0, savedY);
        }
      } else {
        window.scrollTo(0, 0);
      }
    });
  }, [route, isPopState]);

  useEffect(() => {
    // Solo actuamos si hay un hash en la URL
    const hash = window.location.hash;
    if (!hash) return;

    // Usamos requestAnimationFrame o un pequeño timeout
    // para asegurar que el DOM de la nueva página ya se ha pintado
    requestAnimationFrame(() => {
      const id = hash.replace("#", "");
      const element = document.getElementById(id);

      if (element) {
        // scrollIntoView es la forma más moderna y limpia de hacerlo
        element.scrollIntoView({ behavior: "auto" });
        // Si prefieres scroll instantáneo "behavior: auto" es lo suyo para que
        // se parezca al comportamiento nativo del navegador.
      }
    });
  }, [route]);

  // Lógica RSC
  let content = cache.get(route);
  if (!content) {
    const payloadUrl = window.__DINOU_USE_OLD_RSC__
      ? "/____rsc_payload_old____" + route
      : "/____rsc_payload____" + route;

    content = createFromFetch(fetch(payloadUrl));
    cache.set(route, content);
  }

  // 📦 VALOR DEL CONTEXTO: Ahora es un Objeto
  // Usamos useMemo para evitar re-renders innecesarios si algo más cambiara
  const contextValue = useMemo(
    () => ({
      url: route, // La URL actual
      navigate, // La función para navegar
      isPending,
    }),
    [route, isPending]
  );

  return (
    <RouterContext.Provider value={contextValue}>
      {use(content)}
    </RouterContext.Provider>
  );
}

hydrateRoot(document, <Router />);

if (import.meta.hot) {
  import.meta.hot.accept();
}
