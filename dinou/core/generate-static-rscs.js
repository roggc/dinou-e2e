const fs = require("fs");
const path = require("path");
const { PassThrough } = require("stream");
const getSSGJSXOrJSX = require("./get-ssg-jsx-or-jsx.js");
const { renderToPipeableStream } = require("react-server-dom-webpack/server");

// 👇 IMPORTANTE: Necesitas importar tu almacenamiento de contexto
// Ajusta la ruta a donde tengas definido tu AsyncLocalStorage en Dinou
const { requestStorage } = require("./request-context.js");

const OUT_DIR = path.resolve("dist2");
const isWebpack = process.env.DINOU_BUILD_TOOL === "webpack";

async function generateStaticRSCs(routes) {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.resolve(
        isWebpack
          ? "dist3/react-client-manifest.json"
          : "react_client_manifest/react-client-manifest.json"
      ),
      "utf8"
    )
  );

  for (const route of routes) {
    const reqPath = route.endsWith("/") ? route : route + "/";
    const payloadPath = path.join(OUT_DIR, reqPath, "rsc.rsc");

    // 👇 1. CREAMOS EL CONTEXTO MOCK (Igual que en generateStaticPages)
    // Esto asegura que "header" valga "Dinou-SSG-Builder" también aquí
    const mockContext = {
      req: {
        query: {},
        cookies: {},
        headers: {
          "user-agent": "Dinou-SSG-Builder", // 🔥 LA CLAVE
          host: "localhost",
          "x-forwarded-proto": "http",
        },
        path: reqPath,
        method: "GET",
      },
      res: {}, // Mock básico de response si fuera necesario
    };

    try {
      fs.mkdirSync(path.dirname(payloadPath), { recursive: true });
      const fileStream = fs.createWriteStream(payloadPath);
      const passThrough = new PassThrough();

      // 👇 2. ENVOLVEMOS LA GENERACIÓN EN EL CONTEXTO
      await requestStorage.run(mockContext, async () => {
        // Ahora, cuando getSSGJSXOrJSX llame a serverFunction -> getContext(),
        // encontrará nuestro mockContext.
        const jsx = await getSSGJSXOrJSX(reqPath, {});

        const { pipe } = renderToPipeableStream(jsx, manifest);
        pipe(passThrough);
      });

      // El piping lo hacemos fuera o dentro, el stream ya está creado
      passThrough.pipe(fileStream);

      await new Promise((resolve, reject) => {
        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
      });

      console.log("✅ Generated RSC payload:", reqPath);
    } catch (error) {
      console.error("❌ Error generating RSC payload for:", reqPath, error);
    }
  }

  console.log("🟢 Static RSC payload generation complete.");
}

module.exports = generateStaticRSCs;
