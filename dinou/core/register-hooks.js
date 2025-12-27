// src/core/register-hooks.js
const path = require("path");

// 1. Mapa Global para asociar Objetos/Proxies -> Rutas de archivo
if (!global.__DINOU_MODULE_MAP) {
  global.__DINOU_MODULE_MAP = new WeakMap();
}

// 2. Función Helper global que inyectará Babel
global.__DINOU_REGISTER_MODULE = function (mod, absolutePath) {
  if (!mod) return;

  // A) Registrar el module.exports entero
  if (typeof mod === "object" || typeof mod === "function") {
    global.__DINOU_MODULE_MAP.set(mod, absolutePath);
  }

  // B) Registrar el default export (lo más común en React)
  if (
    mod.default &&
    (typeof mod.default === "object" || typeof mod.default === "function")
  ) {
    global.__DINOU_MODULE_MAP.set(mod.default, absolutePath);
  }

  // C) Registrar named exports (si es posible leerlos)
  if (typeof mod === "object") {
    for (const key in mod) {
      if (key !== "default") {
        try {
          const val = mod[key];
          if (val && (typeof val === "object" || typeof val === "function")) {
            global.__DINOU_MODULE_MAP.set(val, absolutePath);
          }
        } catch (e) {
          /* Ignorar traps de Proxy */
        }
      }
    }
  }
};
