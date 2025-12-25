const fs = require("fs");
const path = require("path");
const { PassThrough } = require("stream");
const getSSGJSXOrJSX = require("./get-ssg-jsx-or-jsx.js");
const { renderToPipeableStream } = require("react-server-dom-webpack/server");

// 👇 1. IMPORTAR STORAGE (Ajusta la ruta si es necesario)
const { requestStorage } = require("./request-context.js");

const OUT_DIR = path.resolve("dist2");
const isWebpack = process.env.DINOU_BUILD_TOOL === "webpack";

async function generateStaticRSC(reqPath) {
  const finalReqPath = reqPath.endsWith("/") ? reqPath : reqPath + "/";
  const payloadPath = path.join(OUT_DIR, finalReqPath, "rsc.rsc");

  // 👇 2. DEFINIR MOCK CONTEXT (Debe coincidir con generateStaticPage.js)
  const mockContext = {
    req: {
      query: {},
      cookies: {},
      headers: {
        // 🔥 CRÍTICO: Debe ser idéntico al del HTML para evitar mismatch
        "user-agent": "Dinou-ISR-Revalidator",
        host: "localhost",
        "x-forwarded-proto": "http",
      },
      path: finalReqPath,
      method: "GET",
    },
    res: {},
  };

  try {
    // console.log("🔄 Generating RSC payload for:", finalReqPath);

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

    fs.mkdirSync(path.dirname(payloadPath), { recursive: true });

    const fileStream = fs.createWriteStream(payloadPath);
    const passThrough = new PassThrough();

    // 👇 3. ENVOLVER EN REQUEST STORAGE
    await requestStorage.run(mockContext, async () => {
      // Ahora getContext() dentro de getSSGJSXOrJSX funcionará
      const jsx = await getSSGJSXOrJSX(finalReqPath, {});

      const { pipe } = renderToPipeableStream(jsx, manifest);
      pipe(passThrough);
    });

    passThrough.pipe(fileStream);

    await new Promise((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    });

    console.log("✅ Generated RSC payload (ISR):", finalReqPath);
  } catch (error) {
    console.error("❌ Error generating RSC payload for:", finalReqPath, error);
  }
}

module.exports = generateStaticRSC;
