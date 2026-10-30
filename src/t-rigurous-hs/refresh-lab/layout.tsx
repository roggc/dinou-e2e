import React from "react";
import { HsRefreshControls } from "../hs-client";

export default function HsRefreshLabLayout({
  children,
  refreshLayoutSeq,
}: {
  children: React.ReactNode;
  refreshLayoutSeq?: number;
}) {
  return (
    <div id="hs-refresh-lab-layout" className="p-4 border border-purple-500 rounded my-2">
      <div className="text-xs">
        Refresh Lab Layout Seq: <strong id="hs-refresh-layout-seq">{refreshLayoutSeq}</strong>
      </div>
      <HsRefreshControls />
      <div id="hs-refresh-lab-outlet">{children}</div>
    </div>
  );
}

