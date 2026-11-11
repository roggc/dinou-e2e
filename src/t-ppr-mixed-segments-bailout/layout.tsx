import React, { Suspense } from "react";
import { getContext, Link } from "dinou";
import { BailoutRefreshControls } from "./bailout-client";

async function OuterOptOutLayoutCookieReader() {
  // Outer layout has ppr = false! Reading req.cookies inside <Suspense> here MUST NOT become a PPR hole;
  // it MUST trigger full dynamic SSR bailout for all child routes (even when child Page or Nested Layout has ppr = true)!
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const user = ctx?.req?.cookies?.mppr_bailout_user || "anon-bailout";
  return (
    <div id="mppr-bailout-layout-cookie-box" className="text-xs font-mono">
      Outer Layout (ppr=false) Cookie:{" "}
      <strong id="mppr-bailout-layout-user">{String(user)}</strong>
    </div>
  );
}

export default function MpprInverseBailoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <section
      id="mppr-bailout-layout"
      className="p-4 m-3 rounded-xl border-2 border-rose-500 bg-slate-950 text-slate-100 space-y-2"
    >
      <h1 className="text-sm font-bold text-rose-300">
        Inverse Mixed Bailout Outer Layout (ppr = false reading cookies inside Suspense)
      </h1>
      <BailoutRefreshControls />
      <Suspense fallback={<div id="mppr-bailout-layout-fallback">Loading Outer Cookie...</div>}>
        <OuterOptOutLayoutCookieReader />
      </Suspense>
      <nav className="flex gap-3 text-xs">
        <Link id="mppr-bailout-link-root" href="/t-ppr-mixed-segments-bailout" className="underline text-rose-300">
          PPR Child Page
        </Link>
        <Link
          id="mppr-bailout-link-nested"
          href="/t-ppr-mixed-segments-bailout/nested-ppr"
          className="underline text-amber-300"
        >
          Nested PPR Layout
        </Link>
      </nav>
      <div id="mppr-bailout-outlet">{children}</div>
    </section>
  );
}

