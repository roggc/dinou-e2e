import React from "react";
import { Link } from "dinou";
import { getHsPprState } from "../hsppr-state";
import { HsPprClientStateBox } from "../hsppr-client";

export default function HsPprResetLayout({ children }: { children: React.ReactNode }) {
  const st = getHsPprState();

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>HS+PPR Reset Layout Branch</title>
        <link href="/styles.css" rel="stylesheet" precedence="default" />
      </head>
      <body className="bg-slate-950 text-slate-100 p-6">
        <div
          id="hsppr-reset-layout"
          className="p-4 border-2 border-pink-500 rounded-xl space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between text-xs font-mono">
            <h1 id="hsppr-reset-layout-title" className="text-base font-bold text-pink-300">
              Isolated Reset-Layout PPR Shell
            </h1>
            <span>
              Reset Layout Shell Seq:{" "}
              <strong id="hsppr-reset-layout-seq">{st.resetLayoutShellSeq}</strong>
            </span>
          </div>
          <HsPprClientStateBox idPrefix="hsppr-reset-layout" />
          <nav className="flex gap-4 text-xs">
            <Link id="hsppr-reset-to-no-layout" href="/t-rigurous-hs-ppr/no-layout-ppr" className="underline text-rose-300">
              Go to No-Layout PPR
            </Link>
            <Link id="hsppr-reset-back-link" href="/t-rigurous-hs-ppr" className="underline text-indigo-300">
              Back to HS+PPR L1 Section
            </Link>
          </nav>
          <div id="hsppr-reset-outlet">{children}</div>
        </div>
      </body>
    </html>
  );
}

