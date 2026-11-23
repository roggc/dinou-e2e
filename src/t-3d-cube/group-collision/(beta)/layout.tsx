import { Suspense, type ReactNode } from "react";
import { Link, getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

async function GrpBetaHole() {
  const tag = String(getContext()?.req?.query?.q || "base");
  await cubeSleep(10);
  const s = readCubeState();
  return (
    <span id="grp-beta-hole-seq">
      {`${tag}-${s.grpBetaHoleSeq}`}
    </span>
  );
}

export default function GroupBetaLayout({
  children,
}: {
  children: ReactNode;
}) {
  const s = readCubeState();
  return (
    <section id="grp-beta-layout" data-group="beta">
      <h2 id="grp-beta-banner">Group Beta Shell</h2>
      <span id="grp-beta-shell-seq">{s.grpBetaShellSeq}</span>
      <CubeClientProbe id="grp-beta" />
      <DinouCacheSlot
        id="cube-grp-beta-slot"
        revalidate={3600}
        tags={["cube-grp-beta-slot-tag"]}
      >
        {async () => (
          <span id="grp-beta-slot-seq">{readCubeState().grpBetaSlotSeq}</span>
        )}
      </DinouCacheSlot>
      <Suspense fallback={<span id="grp-beta-hole-fb">loading-beta</span>}>
        <GrpBetaHole />
      </Suspense>
      <nav id="grp-beta-nav" style={{ display: "flex", gap: 8 }}>
        <Link id="link-grp-beta-to-promo" href="/t-3d-cube/group-collision/promo">
          Promo (Alpha)
        </Link>
        <Link id="link-grp-beta-to-settings" href="/t-3d-cube/group-collision/settings">
          Settings
        </Link>
      </nav>
      <main id="grp-beta-main">{children}</main>
    </section>
  );
}
