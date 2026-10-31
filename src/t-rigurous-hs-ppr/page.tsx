import React, { Suspense } from "react";
import { getContext } from "dinou";
import { getHsPprState } from "./hsppr-state";
import { HsPprClientStateBox } from "./hsppr-client";

async function PageAStaticAsyncBox() {
  await new Promise((r) => setTimeout(r, 5));
  const st = getHsPprState();
  return (
    <div
      id="hsppr-page-a-static-suspense-resolved"
      className="p-2 rounded bg-slate-950 border border-emerald-500/50 text-xs font-mono"
    >
      Static Suspense Seq (Resolved in Shell):{" "}
      <strong id="hsppr-page-a-static-suspense-seq">{st.pageAStaticSuspenseSeq}</strong>
    </div>
  );
}

async function PageADynamicHole1({ query }: { query?: Record<string, string> }) {
  await new Promise((r) => setTimeout(r, 12));
  const ctx = getContext();
  const userCookie = ctx?.req?.cookies?.hsppr_user || "anon-hsppr";
  const modeQuery = ctx?.req?.query?.mode || query?.mode || "default-mode";
  const st = getHsPprState();

  return (
    <div
      id="hsppr-page-a-hole1-resolved"
      className="p-2.5 rounded bg-slate-950 border border-amber-500/60 text-xs font-mono flex flex-wrap gap-4"
    >
      <span>
        Page A Hole 1 Seq: <strong id="hsppr-page-a-hole1-seq">{st.pageAHole1Seq}</strong>
      </span>
      <span>
        Page A Hole 1 User: <strong id="hsppr-page-a-hole1-user">{userCookie}</strong>
      </span>
      <span>
        Page A Hole 1 Query: <strong id="hsppr-page-a-hole1-query">{modeQuery}</strong>
      </span>
    </div>
  );
}

async function PageADynamicHole2Inner() {
  await new Promise((r) => setTimeout(r, 8));
  const ctx = getContext();
  const modeQuery = ctx?.req?.query?.mode || "default-mode";
  const st = getHsPprState();
  return (
    <div id="hsppr-page-a-hole2-inner-resolved" className="pl-3 border-l border-fuchsia-500 text-xs font-mono">
      Nested Inner Hole 2 Seq:{" "}
      <strong id="hsppr-page-a-hole2-inner-seq">{st.pageAHole2InnerSeq}</strong> (Query:{" "}
      <strong id="hsppr-page-a-hole2-inner-query">{modeQuery}</strong>)
    </div>
  );
}

async function PageADynamicHole2Outer() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const _bailout = ctx?.req?.headers?.["user-agent"] || "ua";
  const st = getHsPprState();

  return (
    <div
      id="hsppr-page-a-hole2-resolved"
      className="p-2.5 rounded bg-slate-950 border border-fuchsia-500/60 text-xs font-mono space-y-1.5"
    >
      <div>
        Page A Hole 2 Outer Seq:{" "}
        <strong id="hsppr-page-a-hole2-seq">{st.pageAHole2Seq}</strong>
      </div>
      <Suspense fallback={<div id="hsppr-page-a-hole2-inner-fallback">Loading Inner...</div>}>
        <PageADynamicHole2Inner />
      </Suspense>
    </div>
  );
}

export default async function HsPprPageA({
  query,
  pageAPropsSeq,
}: {
  query?: Record<string, string>;
  pageAPropsSeq?: number;
}) {
  const st = getHsPprState();
  const effectivePropsSeq = pageAPropsSeq ?? st.pageAPropsSeq;

  return (
    <div
      id="hsppr-page-a"
      className="p-4 rounded-xl bg-slate-900/80 border border-indigo-500/50 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <h2 className="text-sm font-bold text-indigo-200">
          PPR Page A (Index Route, Inherits ppr=true from L1 Layout)
        </h2>
        <div className="flex gap-4">
          <span>
            Page A Shell Seq:{" "}
            <strong id="hsppr-page-a-shell-seq">{st.pageAShellSeq}</strong>
          </span>
          <span>
            Page A Props Seq:{" "}
            <strong id="hsppr-page-a-props-seq">{effectivePropsSeq}</strong>
          </span>
        </div>
      </div>

      <HsPprClientStateBox idPrefix="hsppr-page-a" />

      {/* Static Suspense Boundary (Does NOT read dynamic request context -> resolves into static shell!) */}
      <Suspense
        fallback={
          <div id="hsppr-page-a-static-suspense-fallback">
            Loading Static Suspense...
          </div>
        }
      >
        <PageAStaticAsyncBox />
      </Suspense>

      {/* Dynamic PPR Hole 1 in Page A */}
      <Suspense
        fallback={
          <div id="hsppr-page-a-hole1-fallback" className="text-xs text-amber-400">
            Loading Page A Dynamic Hole 1...
          </div>
        }
      >
        <PageADynamicHole1 query={query} />
      </Suspense>

      {/* Dynamic PPR Hole 2 in Page A (Contains Nested Suspense) */}
      <Suspense
        fallback={
          <div id="hsppr-page-a-hole2-fallback" className="text-xs text-fuchsia-400">
            Loading Page A Dynamic Hole 2...
          </div>
        }
      >
        <PageADynamicHole2Outer />
      </Suspense>
    </div>
  );
}

