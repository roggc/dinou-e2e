import React from "react";
import { readHsState } from "../hs-state";

export default function HsTtlIsrPage({
  ttlPagePropsSeq = 100,
}: {
  ttlPagePropsSeq?: number;
}) {
  const st = readHsState();
  return (
    <div id="hs-ttl-isr-page" className="p-3 rounded bg-slate-900">
      <div>
        TTL Child Page Seq: <strong id="hs-ttl-page-seq">{st.ttlPageSeq}</strong> | Props:{" "}
        <strong id="hs-ttl-page-props-seq">{ttlPagePropsSeq}</strong>
      </div>
    </div>
  );
}

