export default function TBundlersLivePage() {
  const liveBuildTool = process.env.DINOU_BUILD_TOOL || "unset";
  const unvendorizedEnv =
    typeof process !== "undefined" &&
    Boolean(
      process.env &&
        (process.env.DINOU_UNVENDORIZED === "true" ||
          process.env.DINOU_UNVENDORIZED === "1")
    );
  const execArgvHasUnvendorized =
    typeof process !== "undefined" &&
    Array.isArray(process.execArgv) &&
    process.execArgv.some((arg) => String(arg).includes("unvendorized"));
  const nodeOptionsHasUnvendorized =
    typeof process !== "undefined" &&
    Boolean(process.env?.NODE_OPTIONS?.includes("unvendorized"));

  return (
    <main
      data-testid="t-bundlers-live-page"
      data-live-build-tool={liveBuildTool}
      data-unvendorized-env={String(unvendorizedEnv)}
      data-unvendorized-active={String(
        execArgvHasUnvendorized || nodeOptionsHasUnvendorized
      )}
    >
      <h1 data-testid="bundlers-live-heading">Bundler Live Runtime Probe</h1>
      <p data-testid="bundlers-live-tool">{liveBuildTool}</p>
    </main>
  );
}

