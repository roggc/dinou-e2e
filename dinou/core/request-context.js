// dinou/core/request-context.js

// 1. Definir una clave global única
const DINOU_CONTEXT_KEY = Symbol.for("dinou.request.context.storage");

let requestStorage;

// 2. Lógica Condicional: Servidor vs Cliente
if (typeof window === "undefined") {
  // 🟢 ENTORNO SERVIDOR (Node.js)

  // 🛡️ TRUCO ANTI-BUNDLER:
  // Asignamos 'require' a una variable. Esbuild analiza el código estáticamente.
  // Al ver una variable ejecutando una función, no intenta resolver el string "node:async_hooks".
  // Esto evita el error de build en el cliente.
  const dynamicRequire = require;
  const { AsyncLocalStorage } = dynamicRequire("node:async_hooks");

  // 3. Singleton Global (Tu lógica original)
  if (!global[DINOU_CONTEXT_KEY]) {
    global[DINOU_CONTEXT_KEY] = new AsyncLocalStorage();
  }

  requestStorage = global[DINOU_CONTEXT_KEY];
} else {
  // 🔵 ENTORNO CLIENTE (Navegador)

  // Si por accidente este código llega al navegador, creamos un Mock tonto.
  // Esto evita que 'requestStorage' sea undefined y explote si alguien intenta leerlo.
  requestStorage = {
    run: (store, callback) => callback(),
    getStore: () => undefined, // En el cliente no hay contexto de request
  };
}

// El resto de tu archivo...
function getContext() {
  if (!requestStorage) return undefined;

  const store = requestStorage.getStore();
  return store;
}

module.exports = {
  requestStorage,
  getContext,
};
