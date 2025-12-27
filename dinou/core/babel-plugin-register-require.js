const path = require("path");

module.exports = function ({ types: t }) {
  return {
    visitor: {
      CallExpression(pathNode, state) {
        // Buscamos llamadas a: require('...')
        if (
          t.isIdentifier(pathNode.node.callee, { name: "require" }) &&
          pathNode.node.arguments.length === 1 &&
          t.isStringLiteral(pathNode.node.arguments[0])
        ) {
          // Ignoramos librerías de node_modules para no saturar el mapa
          const importPath = pathNode.node.arguments[0].value;
          if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
            return;
          }

          // Calculamos la ruta absoluta del archivo importado
          const currentFile = state.file.opts.filename;
          const absolutePath = path.resolve(
            path.dirname(currentFile),
            importPath
          );

          // Buscamos la variable donde se asigna el require
          // const MiComp = require('./Comp');
          const parent = pathNode.findParent((p) => p.isVariableDeclaration());

          if (parent) {
            const declarations = parent.node.declarations;
            // Inyectamos el registro DESPUÉS de la declaración
            // __DINOU_REGISTER_MODULE(MiComp, "c:/ruta/...");

            declarations.forEach((decl) => {
              if (t.isIdentifier(decl.id)) {
                parent.insertAfter(
                  t.expressionStatement(
                    t.callExpression(
                      t.identifier("global.__DINOU_REGISTER_MODULE"),
                      [
                        decl.id, // La variable (ej: MiComp)
                        t.stringLiteral(absolutePath),
                      ]
                    )
                  )
                );
              }
            });
          }
        }
      },
    },
  };
};
