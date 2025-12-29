// dinou/core/client.jsx
import {
  use,
  useState,
  useEffect,
  useTransition,
  useLayoutEffect,
  useMemo, // 1. Añadimos useMemo
} from "react";
import { createFromFetch } from "react-server-dom-webpack/client";
import { hydrateRoot } from "react-dom/client";
import { RouterContext } from "./navigation.js";
import { resolveUrl } from "./navigation-utils.js";

const cache = new Map();
const scrollCache = new Map();

const getCurrentRoute = () => window.location.pathname + window.location.search;

// Helper para detectar si solo cambiamos el hash en la misma página
const isHashChangeOnly = (finalPath) => {
  const targetUrl = new URL(finalPath, window.location.origin);
  const normalize = (p) =>
    p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;

  const targetPath = normalize(targetUrl.pathname);
  const currentPath = normalize(window.location.pathname);

  return (
    targetPath + targetUrl.search === currentPath + window.location.search &&
    targetUrl.hash !== ""
  );
};

function Router() {
  const [route, setRoute] = useState(getCurrentRoute());
  const [isPopState, setIsPopState] = useState(false);
  // ⚡️ HOOK DE TRANSICIÓN
  // isPending será true mientras React espera el fetch del RSC y el renderizado
  const [isPending, startTransition] = useTransition();

  // 📦 Función unificada para obtener/pre-cargar RSC
  const getRSCPayload = (url) => {
    // Importante: url ya debe venir normalizada aquí
    if (cache.has(url)) return cache.get(url);

    const payloadUrl = window.__DINOU_USE_OLD_RSC__
      ? "/____rsc_payload_old____" + url
      : "/____rsc_payload____" + url;

    const content = createFromFetch(fetch(payloadUrl));
    cache.set(url, content);
    return content;
  };

  // Exponer prefetch al componente <Link>
  useEffect(() => {
    window.__DINOU_PREFETCH__ = (url) => {
      // 🛡️ PROTECCIÓN PREFETCH: Si es un hash local, no hacemos nada
      if (isHashChangeOnly(url)) return;

      getRSCPayload(url);
    };
  }, []);
  useEffect(() => {
    document.body.setAttribute("data-hydrated", "true");
  }, []);

  const navigate = (href, options = {}) => {
    const finalPath = resolveUrl(href, window.location.pathname);

    // 🛡️ PROTECCIÓN NAVIGATE: Detección de Hash
    if (isHashChangeOnly(finalPath)) {
      // 1. Actualizamos la URL en el navegador (sin recargar)
      if (options.replace) {
        window.history.replaceState(null, "", finalPath);
      } else {
        window.history.pushState(null, "", finalPath);
      }

      // 2. Manejamos el Scroll manualmente (React no se va a enterar)
      const hash = new URL(finalPath, window.location.origin).hash;
      const id = hash.replace("#", "");
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: "auto" });
      }

      // 3. STOP CRÍTICO: No llamamos a startTransition ni setRoute
      // Esto evita el RSC Fetch
      return;
    }

    // ... Resto de la lógica normal de navegación ...
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

      // 1. Usamos el helper unificado
      const finalPath = resolveUrl(href, window.location.pathname);

      // 2. Lógica de comparación de Hash CRÍTICA
      const targetUrlObj = new URL(finalPath, window.location.origin);

      // 🛡️ RESTAURACIÓN DEL FIX: Normalizamos quitando la barra final para comparar
      const normalizePath = (p) =>
        p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;

      const targetPathClean = normalizePath(targetUrlObj.pathname);
      const currentPathClean = normalizePath(window.location.pathname);

      if (
        targetPathClean + targetUrlObj.search ===
          currentPathClean + window.location.search &&
        targetUrlObj.hash
      ) {
        // Es la misma página + hash: STOP. No hacemos nada.
        return;
      }

      e.preventDefault();
      navigate(href); // Pasamos el href original o finalPath, navigate ya resuelve dentro también
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
  let content = getRSCPayload(route);

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
