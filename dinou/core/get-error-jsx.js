const path = require("path");
const { existsSync } = require("./vfs");
const React = require("react");
const {
  getFilePathAndDynamicParams,
} = require("./get-file-path-and-dynamic-params");
const importModule = require("./import-module");
const { asyncRenderJSXToClientJSX } = require("./render-jsx-to-client-jsx");

async function getErrorJSX(reqPath, query, error, isDevelopment = false) {
  const srcFolder = path.resolve(process.cwd(), "src");
  const reqSegments = reqPath.split("/").filter(Boolean);
  const hasRouterSyntax = reqSegments.some((seg) => {
    const isGroup = seg.startsWith("(") && seg.endsWith(")");
    const isDynamic = seg.startsWith("[") && seg.endsWith("]");
    const isSlot = seg.startsWith("@");
    const isPrivate = seg.startsWith("_");

    return isGroup || isDynamic || isSlot || isPrivate;
  });

  let pagePath;
  if (!hasRouterSyntax) {
    const folderPath = path.join(srcFolder, ...reqSegments);
    if (existsSync(folderPath)) {
      for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
        const candidatePath = path.join(folderPath, `error${ext}`);
        if (existsSync(candidatePath)) {
          pagePath = candidatePath;
          break;
        }
      }
    }
  }
  let dynamicParams = {};

  if (!pagePath) {
    const [filePath, dParams] = getFilePathAndDynamicParams(
      reqSegments,
      query,
      srcFolder,
      "error"
    );
    pagePath = filePath;
    dynamicParams = dParams ?? {};
  }

  let jsx;

  if (!pagePath) {
    const [errorPath, dParams] = getFilePathAndDynamicParams(
      reqSegments,
      query,
      srcFolder,
      "error",
      true,
      false
    );
    if (errorPath) {
      pagePath = errorPath;
      dynamicParams = dParams ?? {};
    }
  }

  if (!pagePath && isDevelopment) {
    jsx = React.createElement(
      "div",
      {
        style: {
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          padding: "32px",
          maxWidth: "960px",
          margin: "40px auto",
          backgroundColor: "#fff1f2",
          border: "1px solid #fecdd3",
          borderRadius: "12px",
          color: "#9f1239",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
        },
      },
      React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" } },
        React.createElement("span", { style: { background: "#e11d48", color: "white", padding: "2px 8px", borderRadius: "9999px", fontSize: "12px", fontWeight: "bold" } }, "Dinou Dev Error"),
        React.createElement("h2", { style: { margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#881337" } }, error?.message || "Unhandled Application Error")
      ),
      React.createElement(
        "p",
        { style: { margin: "0 0 16px 0", fontSize: "0.875rem", color: "#9f1239", lineHeight: 1.5 } },
        "An unhandled error occurred during rendering. You can provide a custom error UI by creating an ",
        React.createElement("code", { style: { background: "#ffe4e6", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 } }, "error.tsx"),
        " file in your route folder."
      ),
      error?.stack && React.createElement(
        "pre",
        {
          style: {
            background: "#0f172a",
            color: "#f8fafc",
            padding: "16px",
            borderRadius: "8px",
            overflowX: "auto",
            fontSize: "0.8125rem",
            lineHeight: 1.6,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          },
        },
        error.stack
      )
    );
  }

  if (pagePath) {
    const pageModule = await importModule(pagePath);
    const Page = pageModule.default ?? pageModule;
    jsx = React.createElement(Page, {
      params: dynamicParams ?? {},
      error,
    });

    const noLayoutErrorPath = path.join(
      path.dirname(pagePath),
      `no_layout_error`
    );
    if (existsSync(noLayoutErrorPath)) {
      return jsx;
    }

    if (
      getFilePathAndDynamicParams(
        reqSegments,
        query,
        srcFolder,
        "no_layout",
        false
      )[0]
    ) {
      return jsx;
    }

    const layouts = getFilePathAndDynamicParams(
      reqSegments,
      query,
      srcFolder,
      "layout",
      true,
      false,
      undefined,
      0,
      {},
      true
    );

    if (layouts && Array.isArray(layouts)) {
      let index = 0;
      for (const [layoutPath, dParams, slots] of layouts.reverse()) {
        const layoutModule = await importModule(layoutPath);
        const Layout = layoutModule.default ?? layoutModule;
        const updatedSlots = {};
        for (const [slotName, slotValue] of Object.entries(slots)) {
          let updatedSlotElement;
          const slotFilePath = slotValue?.slotPath || slotValue?.props?.__modulePath;
          const slotParams = slotValue?.slotParams || slotValue?.props?.params || {};
          try {
            let elementToRender;
            if (slotValue && slotValue.slotPath) {
              const slotModule = await importModule(slotValue.slotPath);
              const Slot = slotModule.default ?? slotModule;
              elementToRender = React.createElement(Slot, {
                params: slotParams,
                key: slotName,
                __modulePath: slotValue.slotPath,
              });
            } else {
              elementToRender = slotValue;
            }
            await asyncRenderJSXToClientJSX(elementToRender);
            updatedSlotElement = elementToRender;
          } catch (e) {
            // 1. RECOVER THE REAL PATH
            // Gives us the path to the file: .../src/(group)/@sidebar/page.tsx
            if (slotFilePath) {
              // 2. GET THE SLOT FOLDER
              // Remove the file name to stay with the directory:
              // .../src/(group)/@sidebar
              const realSlotFolder = path.dirname(slotFilePath);

              // 3. SEARCH FOR ERROR.TSX IN THAT FOLDER
              // We use your helper, but now we pass the CORRECT folder as 'currentPath'.
              const [slotErrorPath, slotErrorParams] =
                getFilePathAndDynamicParams(
                  reqSegments,
                  query, // query (irrelevant for searching the file)
                  realSlotFolder, // <--- THE KEY: We search inside the real folder of the slot
                  "error", // We search for 'error' (error.tsx, error.js, etc.)
                  true, // withExtension
                  true, // finalDestination
                  undefined, // lastFound
                  reqSegments.length // TRICK: We force index at the end so that it searches for direct file
                );

              if (slotErrorPath) {
                const slotErrorModule = await importModule(slotErrorPath);
                const SlotError = slotErrorModule.default ?? slotErrorModule;

                const serializedError = {
                  message: e.message || "Unknown Error",
                  name: e.name,
                  stack: isDevelopment ? e.stack : undefined,
                };

                updatedSlotElement = React.createElement(SlotError, {
                  params: slotErrorParams, // Resolved params (if any)
                  key: slotName,
                  error: serializedError, // We pass the captured error
                });
              } else {
                // Optional: If there is no error.tsx, you could log or return null
                console.warn(
                  `[Dinou] Slot @${slotName} failed and does not have error.tsx`
                );
                updatedSlotElement = null;
              }
            } else {
              // If for some reason we do not have __modulePath (e.g., pure static component without wrapper)
              console.error(
                `[Dinou] Could not locate the path of the slot @${slotName}`
              );
              updatedSlotElement = null;
            }
          } finally {
            updatedSlots[slotName] = updatedSlotElement;
          }
        }
        let props = {
          params: dParams,
          ...updatedSlots,
        };
        jsx = React.createElement(Layout, props, jsx);
        const layoutFolderPath = path.dirname(layoutPath);
        if (
          getFilePathAndDynamicParams(
            [],
            {},
            layoutFolderPath,
            "reset_layout",
            false
          )[0]
        ) {
          break;
        }
        index++;
      }
    }
  }

  return jsx;
}

module.exports = {
  getErrorJSX,
};
