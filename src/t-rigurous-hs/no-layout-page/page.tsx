import React from "react";
import { Link } from "dinou";

export default function HsNoLayoutPage() {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>Standalone No Layout Page</title>
        <link href="/styles.css" rel="stylesheet" precedence="default" />
      </head>
      <body className="bg-slate-950 text-slate-100 p-6">
        <main id="hs-no-layout-root" className="p-4 border-2 border-cyan-500 rounded-xl">
          <div id="hs-page-id">no-layout-page</div>
          <h1 id="hs-no-layout-heading">Standalone Page With No Layout</h1>
          <Link id="hs-no-layout-back-link" href="/t-rigurous-hs" className="underline text-xs">
            Return to Section Layout
          </Link>
        </main>
      </body>
    </html>
  );
}

