const path = require("path");
const { existsSync, readFileSync } = require("fs");
const React = require("react");
const importModule = require("./import-module");

async function deserializeReactElement(serialized) {
  // Quita el 2do argumento
  // Check if serialized is a React element object
  if (
    !serialized ||
    typeof serialized !== "object" ||
    !("type" in serialized) ||
    !("props" in serialized)
  ) {
    return serialized; // Pass through strings, nulls, etc.
  }

  const { type, modulePath, props } = serialized;
  let Component;

  // Variable LOCAL, no compartida por referencia
  let isInvalidComponent = false;

  if (modulePath) {
    try {
      const module = await importModule(
        path.resolve(process.cwd(), modulePath)
      );
      Component = module.default ?? module;
    } catch (err) {
      console.error(`Error loading module ${modulePath}:`, err);
      Component = type;
    }
  } else if (type === "__clientComponent__") {
    // Si es un client component sin path, marcamos ESTE nodo como inválido
    isInvalidComponent = true;
  } else if (type === "Suspense") {
    Component = React.Suspense; // 👈 ASIGNACIÓN NATIVA
  } else if (type === "EnhancedSuspense") {
    const { EnhancedSuspense } = require("react-enhanced-suspense");
    Component = EnhancedSuspense;
  } else if (type === "Fragment") {
    Component = React.Fragment;
  }
  //  else if (typeof type === "string" && type !== "Fragment") {
  //   Component = type;
  // }
  else {
    Component = type;
  }

  if (isInvalidComponent) {
    return undefined; // El hijo muere, pero NO mata al padre
  }

  // Deserialize props recursivamente
  const deserializedProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === "children") {
      // Llamada recursiva LIMPIA
      deserializedProps[key] = Array.isArray(value)
        ? await Promise.all(
            value.map((child) => deserializeReactElement(child))
          )
        : value
        ? await deserializeReactElement(value)
        : null;
    } else if (
      value &&
      typeof value === "object" &&
      "type" in value &&
      "props" in value
    ) {
      deserializedProps[key] = await deserializeReactElement(value);
    } else {
      deserializedProps[key] = value;
    }
  }

  return React.createElement(Component, deserializedProps);
}

async function getSSGJSX(reqPath) {
  const distFolder = path.resolve(process.cwd(), "dist");
  const jsonPath = path.join(distFolder, reqPath, "index.json");
  if (existsSync(jsonPath)) {
    const { jsx } = JSON.parse(readFileSync(jsonPath, "utf8"));
    const deserializedJSX = await deserializeReactElement(jsx);
    return deserializedJSX;
  }
}

module.exports = getSSGJSX;
