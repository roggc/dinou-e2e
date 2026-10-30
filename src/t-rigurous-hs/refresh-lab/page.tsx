import React from "react";
import { getContext } from "dinou";

export default async function HsRefreshLabPage({
  refreshPageSeq,
}: {
  refreshPageSeq?: number;
}) {
  const ctx = getContext();
  const filterVal = (ctx?.req?.query as Record<string, string> | undefined)?.filter || "none";

  return (
    <div id="hs-refresh-lab-page" className="p-3 bg-slate-950 rounded">
      <div id="hs-page-id">refresh-lab</div>
      <div className="text-xs">
        Refresh Lab Page Seq: <strong id="hs-refresh-page-seq">{refreshPageSeq}</strong>
      </div>
      <div className="text-xs">
        Query Filter: <strong id="hs-refresh-query-filter">{filterVal}</strong>
      </div>
    </div>
  );
}

