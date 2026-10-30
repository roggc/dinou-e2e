import React from "react";
import { Link } from "dinou";
import { HsLayoutClientState } from "../hs-client";

export default function HsResetLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>Reset Layout Branch</title>
        <link href="/styles.css" rel="stylesheet" precedence="default" />
      </head>
      <body className="bg-slate-950 text-slate-100 p-6">
        <div id="hs-reset-layout" className="p-4 border-2 border-amber-500 rounded-xl">
          <h1 id="hs-reset-layout-title">Isolated Reset Layout Shell</h1>
          <HsLayoutClientState idPrefix="hs-reset" />
          <nav className="flex gap-3 text-xs my-2">
            <Link id="hs-reset-link-root" href="/t-rigurous-hs/reset-branch" className="underline">
              Reset Root
            </Link>
            <Link id="hs-reset-link-sub" href="/t-rigurous-hs/reset-branch/sub" className="underline">
              Reset Sub
            </Link>
            <Link id="hs-reset-link-back" href="/t-rigurous-hs" className="underline">
              Back to Section
            </Link>
          </nav>
          <div id="hs-reset-outlet">{children}</div>
        </div>
      </body>
    </html>
  );
}

