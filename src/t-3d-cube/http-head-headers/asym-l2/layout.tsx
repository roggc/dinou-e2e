import type { ReactNode } from "react";

export default function HttpHeadAsymL2Layout({
  children,
  l2Seq,
}: {
  children: ReactNode;
  l2Seq?: number;
}) {
  return (
    <div id="hh-asym-l2-wrap">
      <span id="hh-asym-l2-seq">{l2Seq ?? 0}</span>
      {children}
    </div>
  );
}
