import React, { Suspense } from "react";
import { Link, getContext } from "dinou";
import { getHsPprState } from "../hsppr-state";

async function NoLayoutDynamicHole() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const nlmode = ctx?.req?.query?.nlmode || "standalone-nlmode";
  const st = getHsPprState();

  return (
    <div
      id="hsppr-no-layout-hole-resolved"
      className="p-2.5 rounded bg-slate-900 border border-rose-500/60 text-xs font-mono flex gap-4"
    >
      <span>
        No-Layout Hole Seq:{" "}
        <strong id="hsppr-no-layout-hole-seq">{st.noLayoutHoleSeq}</strong>
      </span>
      <span>
        No-Layout Hole Query:{" "}
        <strong id="hsppr-no-layout-hole-query">{nlmode}</strong>
      </span>
    </div>
  );
}

export default function HsPprNoLayoutPage() {
  const st = getHsPprState();

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>HS+PPR Standalone No-Layout Page</title>
        <link href="/styles.css" rel="stylesheet" precedence="default" />
      </head>
      <body className="bg-slate-950 text-slate-100 p-6">
        <main
          id="hsppr-no-layout-page"
          className="p-5 border-2 border-rose-500 rounded-xl space-y-3"
        >
          <div className="flex justify-between text-xs font-mono">
            <h1 className="text-base font-bold text-rose-300">
              Standalone no_layout + PPR Page (Zero Ancestor Layouts)
            </h1>
            <span>
              No-Layout Shell Seq:{" "}
              <strong id="hsppr-no-layout-shell-seq">{st.noLayoutShellSeq}</strong>
            </span>
          </div>
          <Suspense
            fallback={
              <div id="hsppr-no-layout-hole-fallback" className="text-xs text-rose-400">
                Loading No-Layout Hole...
              </div>
            }
          >
            <NoLayoutDynamicHole />
          </Suspense>
          <div className="pt-2 text-xs">
            <Link
              id="hsppr-no-layout-back-link"
              href="/t-rigurous-hs-ppr"
              className="underline text-indigo-300"
            >
              Back to HS+PPR L1 Section
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}

