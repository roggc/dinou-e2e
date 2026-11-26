import type { ReactNode } from "react";
import { readCubeState } from "../../shared/cube-state";
import { getRequestScopedViewer } from "../react-cache-helper";

export default async function ReactCacheAsymL2Layout({
  children,
}: {
  children: ReactNode;
}) {
  const s = readCubeState();
  const v = await getRequestScopedViewer("viewer");
  return (
    <div id="er-rc-asym-l2">
      <span id="er-rc-asym-l2-seq">{s.erAsymL2Seq}</span>
      <span id="er-rc-asym-l2-tenant">{v.tenant}</span>
      <span id="er-rc-asym-l2-token">{v.token}</span>
      {children}
    </div>
  );
}
