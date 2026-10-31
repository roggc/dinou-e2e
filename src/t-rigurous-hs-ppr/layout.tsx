import React, { Suspense } from "react";
import { Link, getContext } from "dinou";
import { getHsPprState } from "./hsppr-state";
import {
  HsPprClientStateBox,
  HsPprManualControls,
  HsPprAutomatedSuiteRunner,
} from "./hsppr-client";

async function L1LayoutDynamicHole() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const userCookie = ctx?.req?.cookies?.hsppr_user || "anon-hsppr";
  const lmode = ctx?.req?.query?.lmode || "default-lmode";
  const st = getHsPprState();

  return (
    <div
      id="hsppr-l1-hole-resolved"
      className="p-2 rounded bg-slate-900 border border-amber-500/60 text-xs font-mono flex flex-wrap gap-4"
    >
      <span>
        L1 Hole Seq: <strong id="hsppr-l1-hole-seq">{st.l1LayoutHoleSeq}</strong>
      </span>
      <span>
        L1 Hole User: <strong id="hsppr-l1-hole-user">{userCookie}</strong>
      </span>
      <span>
        L1 Hole Query: <strong id="hsppr-l1-hole-query">{lmode}</strong>
      </span>
    </div>
  );
}

export default function HsPprL1Layout({
  children,
  sidebar,
  l1LayoutPropsSeq = 100,
}: {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  l1LayoutPropsSeq?: number;
}) {
  const st = getHsPprState();

  return (
    <section
      id="hsppr-l1-layout"
      className="p-5 m-4 rounded-xl border-2 border-indigo-500 bg-slate-950 text-slate-100 space-y-3"
    >
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 id="hsppr-layout-title" className="text-lg font-bold text-indigo-300">
            HS + PPR Synergy Layout (L1, Pure No-CacheSlot)
          </h1>
          <div className="flex gap-4 text-xs font-mono">
            <span>
              L1 Shell Seq: <strong id="hsppr-l1-layout-seq">{st.l1LayoutSeq}</strong>
            </span>
            <span>
              L1 Props Seq: <strong id="hsppr-l1-props-seq">{l1LayoutPropsSeq}</strong>
            </span>
          </div>
        </div>

        <HsPprClientStateBox idPrefix="hsppr-l1" />

        {/* Dynamic PPR Hole #1 inside L1 Layout */}
        <Suspense
          fallback={
            <div id="hsppr-l1-hole-fallback" className="text-xs text-amber-400">
              Loading L1 Layout Hole...
            </div>
          }
        >
          <L1LayoutDynamicHole />
        </Suspense>

        {/* Parallel Route @sidebar (contains Static Shell + Dynamic PPR Hole #2) */}
        <div id="hsppr-sidebar-container">{sidebar}</div>

        <nav className="flex flex-wrap gap-3 pt-1 text-xs">
          <Link id="hsppr-link-page-a" href="/t-rigurous-hs-ppr" className="underline text-indigo-300">
            PPR Page A (Index)
          </Link>
          <Link
            id="hsppr-link-page-a-query"
            href="/t-rigurous-hs-ppr?mode=nav-query&lmode=nav-lmode"
            className="underline text-amber-300"
          >
            PPR Page A (?mode=nav-query)
          </Link>
          <Link id="hsppr-link-ppr-b" href="/t-rigurous-hs-ppr/ppr-b" className="underline text-cyan-300">
            PPR Page B
          </Link>
          <Link
            id="hsppr-link-static-optout"
            href="/t-rigurous-hs-ppr/static-optout"
            className="underline text-emerald-300"
          >
            Static Opt-Out (ppr=false)
          </Link>
          <Link
            id="hsppr-link-nested"
            href="/t-rigurous-hs-ppr/nested"
            className="underline text-purple-300"
          >
            Nested L2 PPR Route
          </Link>
          <Link
            id="hsppr-link-reset-ppr"
            href="/t-rigurous-hs-ppr/reset-ppr"
            className="underline text-pink-300"
          >
            Reset-Layout PPR Route
          </Link>
          <Link
            id="hsppr-link-no-layout-ppr"
            href="/t-rigurous-hs-ppr/no-layout-ppr"
            className="underline text-rose-300"
          >
            No-Layout PPR Route
          </Link>
          <Link
            id="hsppr-link-team-alpha"
            href="/t-rigurous-hs-ppr/team/alpha"
            className="underline text-teal-300"
          >
            Team Alpha (Validated PPR)
          </Link>
        </nav>

        <HsPprManualControls />
        <HsPprAutomatedSuiteRunner />
      </header>

      <div id="hsppr-page-outlet">{children}</div>
    </section>
  );
}

