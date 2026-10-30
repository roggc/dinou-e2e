import React from "react";
import { HsRevalidationLabControls } from "./hs-client";

export default async function HsIndexPage({
  pageTitle,
  page,
  pageRenderSeq,
  pageNote,
  pageTimestamp,
}: {
  pageTitle?: string;
  page?: number;
  pageRenderSeq?: number;
  pageNote?: string;
  pageTimestamp?: string;
}) {
  return (
    <main id="hs-index-page" className="p-4 bg-slate-900 rounded border border-slate-700">
      <div id="hs-page-id">index</div>
      <h2 id="hs-index-page-title" className="text-lg font-semibold">
        {pageTitle}
      </h2>
      <div id="hs-index-page-prop">Page Prop: {page}</div>
      <div id="hs-index-page-seq">{pageRenderSeq}</div>
      <div id="hs-index-page-note">{pageNote}</div>
      <div id="hs-index-page-time" data-testid="timestamp">{pageTimestamp}</div>
      <HsRevalidationLabControls />
    </main>
  );
}

