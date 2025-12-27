// const path = require("path");
// const { getAbsPathWithExt } = require("./get-abs-path-with-ext.js");
// const { pathToFileURL } = require("url");

// module.exports = function ({ types: t }) {
//   return {
//     visitor: {
//       ImportDeclaration(pathNode, state) {
//         const currentFile = state.file.opts.filename;
//         const source = pathNode.node.source.value;

//         // Obtenemos la ruta absoluta usando tu helper
//         let absolutePath = getAbsPathWithExt(source, {
//           parentURL: pathToFileURL(currentFile).href, // Pasar el archivo actual como contexto
//         });

//         // 🛑 VALIDACIÓN: Si no es un archivo local o no se pudo resolver, ignoramos
//         if (!absolutePath) return;
//         // const source = getAbsPathWithExt(pathNode.node.source.value, {
//         //   parentURL: undefined,
//         // });

//         // // Filtramos librerías externas si quieres, o solo paths relativos
//         // if (!source.startsWith(".") && !source.startsWith("/")) {
//         //   return;
//         // }

//         // const currentFile = state.file.opts.filename;
//         // absolutePath = path.resolve(path.dirname(absolutePath), source);

//         const specifiers = pathNode.node.specifiers;
//         const injections = [];

//         specifiers.forEach((spec) => {
//           // spec.local.name es el nombre de la variable en TU archivo
//           // (ej: ClientRedirect, o MyRedirect si usas 'as')
//           const localIdentifier = spec.local.name;

//           // Generamos: global.__DINOU_REGISTER_MODULE(NombreVariable, "ruta...")
//           injections.push(
//             t.expressionStatement(
//               t.callExpression(t.identifier("global.__DINOU_REGISTER_MODULE"), [
//                 t.identifier(localIdentifier),
//                 t.stringLiteral(absolutePath),
//               ])
//             )
//           );
//         });

//         // Insertamos el registro JUSTO DESPUÉS del import
//         if (injections.length > 0) {
//           pathNode.insertAfter(injections);
//         }
//       },
//     },
//   };
// };

// // babel-plugin-register-imports.js
// const path = require("path");
// const { getAbsPathWithExt } = require("./get-abs-path-with-ext.js");
// const { pathToFileURL } = require("url");

// module.exports = function ({ types: t }) {
//   return {
//     visitor: {
//       ImportDeclaration(pathNode, state) {
//         const currentFile = state.file.opts.filename;

//         // Obtenemos la ruta absoluta usando tu helper
//         const absolutePath = getAbsPathWithExt(pathNode.node.source.value, {
//           parentURL: pathToFileURL(currentFile).href, // Pasar el archivo actual como contexto
//         });

//         // 🛑 VALIDACIÓN: Si no es un archivo local o no se pudo resolver, ignoramos
//         if (!absolutePath) return;

//         const specifiers = pathNode.node.specifiers;
//         const injections = [];

//         specifiers.forEach((spec) => {
//           const localIdentifier = spec.local.name;

//           injections.push(
//             t.expressionStatement(
//               t.callExpression(t.identifier("global.__DINOU_REGISTER_MODULE"), [
//                 t.identifier(localIdentifier),
//                 t.stringLiteral(absolutePath), // Ya es absoluta y tiene extensión
//               ])
//             )
//           );
//         });

//         if (injections.length > 0) {
//           pathNode.insertAfter(injections);
//         }
//       },
//     },
//   };
// };

const path = require("path");
const { getAbsPathWithExt } = require("./get-abs-path-with-ext.js");
const { pathToFileURL } = require("url");

module.exports = function ({ types: t }) {
  return {
    visitor: {
      ImportDeclaration(pathNode, state) {
        const sourceValue = pathNode.node.source.value;

        // No registrar librerías core o node_modules
        if (!sourceValue.startsWith(".") && !sourceValue.startsWith("@/")) {
          return;
        }

        const currentFile = state.file.opts.filename;
        const absolutePath = getAbsPathWithExt(sourceValue, {
          parentURL: pathToFileURL(currentFile).href,
        });

        if (!absolutePath) return;

        const specifiers = pathNode.node.specifiers;
        const injections = [];

        specifiers.forEach((spec) => {
          // Si es un import de tipo valor (no de tipo type en TS)
          if (t.isImportSpecifier(spec) || t.isImportDefaultSpecifier(spec)) {
            const localIdentifier = spec.local.name;

            // Inyectamos con un try-catch interno por si la variable
            // está en una "TDZ" (Temporal Dead Zone)
            injections.push(
              t.tryStatement(
                t.blockStatement([
                  t.expressionStatement(
                    t.callExpression(
                      t.identifier("global.__DINOU_REGISTER_MODULE"),
                      [
                        t.identifier(localIdentifier),
                        t.stringLiteral(absolutePath),
                      ]
                    )
                  ),
                ]),
                t.catchClause(t.identifier("e"), t.blockStatement([]))
              )
            );
          }
        });

        if (injections.length > 0) {
          pathNode.insertAfter(injections);
        }
      },
    },
  };
};
