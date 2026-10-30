import React from "react";

export default async function HsSiblingBPage({
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
    <main id="hs-sibling-b-page" className="p-4 bg-slate-900 rounded border border-slate-700">
      <div id="hs-page-id">sibling-b</div>
      <h2 id="hs-sibling-b-title" className="text-lg font-semibold">
        {pageTitle}
      </h2>
      <div id="hs-sibling-b-page-prop">Page Prop: {page}</div>
      <div id="hs-sibling-b-seq">{pageRenderSeq}</div>
      <div id="hs-sibling-b-note">{pageNote}</div>
      <div id="hs-sibling-b-time" data-testid="timestamp">{pageTimestamp}</div>
    </main>
  );
}

