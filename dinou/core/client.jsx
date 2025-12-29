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

  const navigate = (href, options = {}) => {
    // 🧭 NORMALIZACIÓN: Convertir cualquier ruta (relativa o absoluta) en absoluta
    // Si href es "contacto", se convierte en "/ruta-actual/contacto"
    const resolvedUrl = new URL(href, window.location.href);
    const absoluteHref =
      resolvedUrl.pathname + resolvedUrl.search + resolvedUrl.hash;

    scrollCache.set(
      window.location.pathname + window.location.search,
      window.scrollY
    );

    if (options.replace) {
      window.history.replaceState(null, "", absoluteHref);
    } else {
      window.history.pushState(null, "", absoluteHref);
    }

    startTransition(() => {
      setIsPopState(false);
      setRoute(absoluteHref);
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

      // 1. Validar si es una URL interna (mismo dominio)
      // Usamos anchor.href porque el navegador ya la devuelve absoluta automáticamente
      const targetUrl = new URL(anchor.href);
      if (targetUrl.origin !== window.location.origin) return;

      // 2. Si es un hash en la misma página, dejamos que el navegador lo maneje
      if (
        href.startsWith("#") ||
        (targetUrl.pathname === window.location.pathname && targetUrl.hash)
      ) {
        return;
      }

      e.preventDefault();

      // 3. Extraemos el path relativo al dominio (pathname + search + hash)
      const fullPath = targetUrl.pathname + targetUrl.search + targetUrl.hash;
      navigate(fullPath);
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
