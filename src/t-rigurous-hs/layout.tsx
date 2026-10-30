import React from "react";
import { Link } from "dinou";
import { HsLayoutClientState, HsAutomatedSuiteRunner } from "./hs-client";

export default function HsSectionLayout({
  children,
  layoutTitle,
  layoutMenu = [],
  layoutRenderSeq,
  layoutNote,
  layoutTimestamp,
}: {
  children: React.ReactNode;
  layoutTitle?: string;
  layoutMenu?: string[];
  layoutRenderSeq?: number;
  layoutNote?: string;
  layoutTimestamp?: string;
}) {
  return (
    <section id="hs-section-layout" className="p-6 border-2 border-indigo-500 rounded-xl m-4">
      <header className="mb-4">
        <h1 id="hs-section-layout-title" className="text-xl font-bold">
          {layoutTitle || "Fallback Title"}
        </h1>
        <div className="text-xs text-slate-300 flex gap-4 mt-1">
          <span>
            Layout Seq: <strong id="hs-section-layout-seq">{layoutRenderSeq}</strong>
          </span>
          <span>
            Layout Note: <strong id="hs-section-layout-note">{layoutNote}</strong>
          </span>
          <span>
            Layout Time: <strong id="hs-section-layout-time">{layoutTimestamp}</strong>
          </span>
        </div>
        <ul id="hs-section-layout-menu" className="flex gap-2 text-xs text-indigo-300 mt-1">
          {layoutMenu.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <HsLayoutClientState idPrefix="hs-section" />
        <nav className="flex flex-wrap gap-2 mt-2 text-xs">
          <Link id="hs-link-index" href="/t-rigurous-hs" className="underline">
            Index
          </Link>
          <Link id="hs-link-sibling-a" href="/t-rigurous-hs/sibling-a" className="underline">
            Sibling A
          </Link>
          <Link
            id="hs-link-sibling-a-fresh"
            href="/t-rigurous-hs/sibling-a"
            fresh
            className="underline text-amber-300"
          >
            Sibling A (Fresh)
          </Link>
          <Link id="hs-link-sibling-b" href="/t-rigurous-hs/sibling-b" className="underline">
            Sibling B
          </Link>
          <Link id="hs-link-nested-1" href="/t-rigurous-hs/nested/page-1" className="underline">
            Nested 1
          </Link>
          <Link id="hs-link-nested-2" href="/t-rigurous-hs/nested/page-2" className="underline">
            Nested 2
          </Link>
          <Link id="hs-link-reset" href="/t-rigurous-hs/reset-branch" className="underline">
            Reset Layout Branch
          </Link>
          <Link id="hs-link-no-layout" href="/t-rigurous-hs/no-layout-page" className="underline">
            No Layout Page
          </Link>
          <Link id="hs-link-dept-eng" href="/t-rigurous-hs/dept/eng" className="underline">
            Dept Eng
          </Link>
          <Link id="hs-link-dept-eng-members" href="/t-rigurous-hs/dept/eng/members" className="underline">
            Dept Eng Members
          </Link>
          <Link id="hs-link-dept-design" href="/t-rigurous-hs/dept/design" className="underline">
            Dept Design
          </Link>
          <Link id="hs-link-locked-alpha" href="/t-rigurous-hs/locked/alpha" className="underline">
            Locked Alpha
          </Link>
          <Link
            id="hs-link-refresh-lab"
            href="/t-rigurous-hs/refresh-lab?filter=active"
            className="underline"
          >
            Refresh Lab
          </Link>
          <Link
            id="hs-link-error-healthy"
            href="/t-rigurous-hs/error-isolation/healthy"
            className="underline"
          >
            Error Isolation Healthy
          </Link>
          <Link
            id="hs-link-error-broken"
            href="/t-rigurous-hs/error-isolation/broken"
            className="underline text-rose-400"
          >
            Error Isolation Broken
          </Link>
        </nav>
        <HsAutomatedSuiteRunner />
      </header>
      <div id="hs-section-page-outlet">{children}</div>
    </section>
  );
}
