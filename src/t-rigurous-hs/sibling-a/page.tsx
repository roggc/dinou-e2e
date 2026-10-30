import React from "react";

export default async function HsSiblingAPage({
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
    <main id="hs-sibling-a-page" className="p-4 bg-slate-900 rounded border border-slate-700">
      <div id="hs-page-id">sibling-a</div>
      <h2 id="hs-sibling-a-title" className="text-lg font-semibold">
        {pageTitle}
      </h2>
      <div id="hs-sibling-a-page-prop">Page Prop: {page}</div>
      <div id="hs-sibling-a-seq">{pageRenderSeq}</div>
      <div id="hs-sibling-a-note">{pageNote}</div>
      <div id="hs-sibling-a-time" data-testid="timestamp">{pageTimestamp}</div>
    </main>
  );
}

