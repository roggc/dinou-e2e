// src/test-ppr/no-ppr-bailout/page.tsx
import { Suspense } from "react";
import { getContext } from "dinou";
import { incrementRenderCount } from "../ppr-tracker";

async function CookieReaderInsideSuspenseNoPpr() {
  await new Promise((r) => setTimeout(r, 10));
  const count = incrementRenderCount("no-ppr-bailout:suspense-cookie-child");
  const ctx = getContext();
  const user = ctx?.req?.cookies?.noppr_user ?? "guest";
  return (
    <div data-testid="no-ppr-bailout-child">
      childRenderCount={count} | user={String(user)}
    </div>
  );
}

export default async function NoPprBailoutPage() {
  await new Promise((r) => setTimeout(r, 10));
  const rootCount = incrementRenderCount("no-ppr-bailout:page-root");

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>No-PPR Full Bailout</title>
      </head>
      <body>
        <div data-testid="no-ppr-bailout-page">
          <h1>Full-Page Bailout on ppr = false Even Inside &lt;Suspense&gt;</h1>
          <p data-testid="no-ppr-bailout-root">rootRenderCount={rootCount}</p>
          <Suspense fallback={<div data-testid="no-ppr-bailout-fallback">Loading...</div>}>
            <CookieReaderInsideSuspenseNoPpr />
          </Suspense>
        </div>
      </body>
    </html>
  );
}

