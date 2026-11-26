import { Suspense } from "react";
import { getContext } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";
import { getRequestScopedViewer } from "../react-cache-helper";

async function AsymHoleA() {
  void getContext()?.req?.headers?.["x-tenant"];
  const v = await getRequestScopedViewer("viewer");
  return (
    <div id="er-asym-hole-a">
      <span id="er-asym-hole-a-tenant">{v.tenant}</span>
      <span id="er-asym-hole-a-token">{v.token}</span>
    </div>
  );
}

async function AsymHoleB() {
  void getContext()?.req?.headers?.["x-tenant"];
  await new Promise((r) => setTimeout(r, 5));
  const v = await getRequestScopedViewer("viewer");
  return (
    <div id="er-asym-hole-b">
      <span id="er-asym-hole-b-tenant">{v.tenant}</span>
      <span id="er-asym-hole-b-token">{v.token}</span>
    </div>
  );
}

export default function ReactCacheAsymPage() {
  const s = readCubeState();
  return (
    <section id="er-rc-asym-page">
      <span id="er-rc-asym-shell-seq">{s.erAsymShellSeq}</span>
      <Suspense fallback={<span>loading-asym-a</span>}>
        <AsymHoleA />
      </Suspense>
      <Suspense fallback={<span>loading-asym-b</span>}>
        <AsymHoleB />
      </Suspense>
    </section>
  );
}
