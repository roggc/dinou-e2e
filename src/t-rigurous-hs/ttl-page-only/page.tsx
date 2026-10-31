import React from "react";
import { readHsState } from "../hs-state";

export default function HsTtlPageOnlyPage({
  ttlPageOnlyPropsSeq = 100,
}: {
  ttlPageOnlyPropsSeq?: number;
}) {
  const st = readHsState();
  return (
    <div id="hs-ttl-page-only-page" className="p-3 rounded bg-slate-900">
      <div>
        TTL Page-Only Seq: <strong id="hs-ttl-page-only-seq">{st.ttlPageOnlySeq}</strong> | Props:{" "}
        <strong id="hs-ttl-page-only-props-seq">{ttlPageOnlyPropsSeq}</strong>
      </div>
    </div>
  );
}

