import { Suspense } from "react";
import { getContext, noDynamic } from "dinou";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeClientProbe } from "../shared/cube-client";

async function HsPprAStaticSusp() {
  noDynamic();
  await cubeSleep(5);
  const st = readCubeState();
  return <span id="hsppr-a-static-susp">{st.hspprAStaticSuspSeq}</span>;
}

async function HsPprADynHole() {
  const ctx = getContext();
  const q = ctx?.req?.query?.q || "default";
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <span id="hsppr-a-hole" data-q={String(q)}>
      {st.hspprAHoleSeq}
    </span>
  );
}

export default function HsPprAPage() {
  const st = readCubeState();
  return (
    <article id="hsppr-a-page">
      <span id="hsppr-a-shell">{st.hspprAShellSeq}</span>
      <CubeClientProbe id="hsppr-a" />
      <Suspense fallback={<span>loading-static-susp</span>}>
        <HsPprAStaticSusp />
      </Suspense>
      <Suspense fallback={<span id="hsppr-a-hole-fb">loading-a-hole</span>}>
        <HsPprADynHole />
      </Suspense>
    </article>
  );
}
