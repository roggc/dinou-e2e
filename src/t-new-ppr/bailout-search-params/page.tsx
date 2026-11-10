import { Suspense } from "react";
import { useSearchParams } from "dinou";
import { incrementRenderCount } from "../ppr-tracker";
import { ClientShellSearchWidget } from "../search-params/client-search-widgets";

async function InnerBailoutBox() {
  const count = incrementRenderCount("bailout-sp:inner");
  await new Promise((r) => setTimeout(r, 10));
  return <div data-testid="bailout-sp-inner">innerRenderCount={count}</div>;
}

export default function BailoutSearchParamsPage() {
  const rootCount = incrementRenderCount("bailout-sp:root");
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "none";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Bailout useSearchParams</title>
      </head>
      <body>
        <div data-testid="bailout-sp-page">
          <h1>Full-Page Bailout via Unwrapped useSearchParams (ppr = true)</h1>
          <p data-testid="bailout-sp-root">
            rootRenderCount={rootCount} | q={q}
          </p>
          <ClientShellSearchWidget />
          <Suspense fallback={<div>Loading inner...</div>}>
            <InnerBailoutBox />
          </Suspense>
        </div>
      </body>
    </html>
  );
}

