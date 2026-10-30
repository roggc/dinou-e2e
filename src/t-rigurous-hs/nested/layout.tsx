import React from "react";
import { HsLayoutClientState } from "../hs-client";

export default function HsNestedLayout({
  children,
  nestedTitle,
  nestedLayoutSeq,
  badge,
  brokenSlot,
}: {
  children: React.ReactNode;
  nestedTitle?: string;
  nestedLayoutSeq?: number;
  badge?: React.ReactNode;
  brokenSlot?: React.ReactNode;
}) {
  return (
    <div id="hs-nested-layout" className="p-4 border-2 border-emerald-500 rounded-lg my-3">
      <h2 id="hs-nested-layout-title" className="text-base font-bold text-emerald-300">
        {nestedTitle}
      </h2>
      <div className="text-xs">
        Nested Layout Seq: <strong id="hs-nested-layout-seq">{nestedLayoutSeq}</strong>
      </div>
      <div id="hs-nested-slot-badge">{badge}</div>
      <div id="hs-nested-slot-broken">{brokenSlot}</div>
      <HsLayoutClientState idPrefix="hs-nested" />
      <div id="hs-nested-page-outlet">{children}</div>
    </div>
  );
}

