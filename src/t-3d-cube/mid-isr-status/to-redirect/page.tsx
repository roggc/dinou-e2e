import { Suspense } from "react";
import { ClientRedirect, getContext, redirect } from "dinou";
import { readCubeState } from "../../shared/cube-state";

async function MisRedirectHole() {
  void getContext()?.req?.headers?.["x-mis-hole"];
  await Promise.resolve();
  return <span id="mis-redir-hole-seq">{readCubeState().misRedirectHoleSeq}</span>;
}

export default function MidIsrToRedirectPage() {
  const s = readCubeState();
  if (s.misRedirectMode === "redirect") {
    return redirect("/t-3d-cube/mid-isr-status/target");
  }
  if (s.misRedirectMode === "res-redirect-307") {
    getContext()?.res?.redirect?.(307, "/t-3d-cube/mid-isr-status/target");
    return null;
  }
  if (s.misRedirectMode === "throw-internal") {
    throw {
      $$type: "dinou-internal-redirect",
      url: "/t-3d-cube/mid-isr-status/target",
    };
  }
  if (s.misRedirectMode === "client-redirect") {
    return <ClientRedirect to="/t-3d-cube/mid-isr-status/target" />;
  }
  return (
    <article id="mis-redir-active" data-status="200">
      <span id="mis-redir-seq">{s.misRedirectPageSeq}</span>
      <Suspense fallback={<span id="mis-redir-hole-fb">loading-redir-hole</span>}>
        <MisRedirectHole />
      </Suspense>
    </article>
  );
}
