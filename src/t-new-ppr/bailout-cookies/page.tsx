import { Suspense } from "react";
import { getContext } from "dinou";
import { incrementRenderCount } from "../ppr-tracker";

async function InnerSuspenseBox() {
  const count = incrementRenderCount("bailout-cookies:inner-suspense");
  await new Promise((r) => setTimeout(r, 10));
  return (
    <div data-testid="bailout-cookies-inner">
      Inner Suspense renderCount={count}
    </div>
  );
}

export default async function BailoutCookiesPage() {
  const rootCount = incrementRenderCount("bailout-cookies:page-root");
  const ctx = getContext();
  const user = ctx?.req?.cookies?.bailout_user ?? "anonymous";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Bailout Cookies</title>
      </head>
      <body>
        <div data-testid="bailout-cookies-page">
          <h1>Full-Page Bailout via Unwrapped Cookies (ppr = true)</h1>
          <p data-testid="bailout-cookies-root">
            rootRenderCount={rootCount} | cookie={String(user)}
          </p>
          <Suspense fallback={<div>Loading inner...</div>}>
            <InnerSuspenseBox />
          </Suspense>
        </div>
      </body>
    </html>
  );
}
