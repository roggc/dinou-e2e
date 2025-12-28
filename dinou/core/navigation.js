// dinou/core/navigation.js
"use client";
import React from "react";

// Mocks defensivos (igual que antes)
const createContext =
  React.createContext ||
  ((defaultValue) => ({
    Provider: ({ children }) => children,
    _currentValue: defaultValue,
  }));
const useContext = React.useContext || (() => null);

export const RouterContext = createContext(""); // Default valor simple

export function usePathname() {
  // 🟢 1. INTENTO DE LEER DEL SERVIDOR (Node.js)
  // Quitamos la condición "!React.useContext".
  // Queremos que esto corra SIEMPRE que estemos en el servidor.
  if (typeof window === "undefined") {
    try {
      const dynamicRequire = require;
      const { getContext } = dynamicRequire("./request-context.js");
      const ctx = getContext();

      // Si tenemos contexto de petición, esa es la verdad absoluta
      if (ctx && ctx.req) {
        return ctx.req.path;
      }
    } catch (e) {
      // Si falla (ej. estamos renderizando estático sin request), continuamos
    }
  }

  // 🔵 2. INTENTO DE LEER DEL CONTEXTO (Cliente o Fallback)
  // Si estamos en el navegador, O si falló la lectura del server context
  const fullRoute = useContext(RouterContext);

  if (typeof fullRoute !== "string") {
    return "";
  }

  return fullRoute.split("?")[0];
}

export function useSearchParams() {
  // 🟢 1. INTENTO DE LEER DEL SERVIDOR
  if (typeof window === "undefined") {
    try {
      const dynamicRequire = require;
      const { getContext } = dynamicRequire("./request-context.js");
      const ctx = getContext();
      if (ctx && ctx.req && ctx.req.query) {
        const params = new URLSearchParams();
        Object.entries(ctx.req.query).forEach(([key, val]) => {
          if (Array.isArray(val)) val.forEach((v) => params.append(key, v));
          else if (val) params.append(key, val);
        });
        return params;
      }
    } catch (e) {}
  }

  // 🔵 2. LÓGICA DE CLIENTE
  const fullRoute = useContext(RouterContext);
  if (typeof fullRoute !== "string") return new URLSearchParams();

  const searchPart = fullRoute.split("?")[1] || "";
  return new URLSearchParams(searchPart);
}

// export const RouterContext = createContext({
//   url: "/",
//   navigate: (url) => {},
// });
