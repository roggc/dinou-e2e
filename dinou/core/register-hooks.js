// src/core/register-hooks.js

if (!global.__DINOU_MODULE_MAP) {
  global.__DINOU_MODULE_MAP = new WeakMap();
}

global.__DINOU_REGISTER_MODULE = function (mod, absolutePath) {
  if (!mod) return;

  // Registramos la referencia directa (sea función o Proxy de Client Reference)
  if (typeof mod === "object" || typeof mod === "function") {
    global.__DINOU_MODULE_MAP.set(mod, absolutePath);
  }

  // Registramos el .default si existe, por si React usa esa referencia
  try {
    if (
      mod.default &&
      (typeof mod.default === "object" || typeof mod.default === "function")
    ) {
      global.__DINOU_MODULE_MAP.set(mod.default, absolutePath);
    }
  } catch (e) {
    // Es un Proxy restringido, no pasa nada
  }
};
