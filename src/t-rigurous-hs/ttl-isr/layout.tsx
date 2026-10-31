import React from "react";
import { readHsState } from "../hs-state";

export default function HsTtlIsrLayout({
  children,
  ttlLayoutPropsSeq = 100,
}: {
  children: React.ReactNode;
  ttlLayoutPropsSeq?: number;
}) {
  const st = readHsState();
  return (
    <div id="hs-ttl-isr-layout" className="p-3 rounded border border-orange-500">
      <div>
        TTL Layout Seq: <strong id="hs-ttl-layout-seq">{st.ttlLayoutSeq}</strong> | Props:{" "}
        <strong id="hs-ttl-layout-props-seq">{ttlLayoutPropsSeq}</strong>
      </div>
      <div id="hs-ttl-isr-outlet">{children}</div>
    </div>
  );
}

