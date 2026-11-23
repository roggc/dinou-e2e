import { Suspense } from "react";
import { Link, getContext } from "dinou";
import { cubeSleep } from "../shared/cube-state";

async function NotFoundReason() {
  const ctx = getContext();
  const reason = String(ctx?.req?.query?.reason || "unknown");
  await cubeSleep(10);
  return <span id="ppr-nf-boundary-reason">{reason}</span>;
}

export default function PprSectionNotFound() {
  return (
    <div id="ppr-nf-boundary" data-not-found="true">
      <h2>Custom 404 inside PPR L1 Layout</h2>
      <Suspense fallback={<span>nf-reason-fb</span>}>
        <NotFoundReason />
      </Suspense>
      <Link id="link-ppr-nf-recover" href="/t-3d-cube/ppr-not-found?ok=recovered">
        Recover to Healthy PPR
      </Link>
    </div>
  );
}
