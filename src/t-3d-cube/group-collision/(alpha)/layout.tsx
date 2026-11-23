import { Suspense, type ReactNode } from "react";
import { Link, getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

async function GrpAlphaHole() {
  const tag = String(getContext()?.req?.query?.q || "base");
  await cubeSleep(10);
  const s = readCubeState();
  return (
    <span id="grp-alpha-hole-seq">
      {`${tag}-${s.grpAlphaHoleSeq}`}
    </span>
  );
}

export default function GroupAlphaLayout({
  children,
}: {
  children: ReactNode;
}) {
  const s = readCubeState();
  return (
    <section id="grp-alpha-layout" data-group="alpha">
      <h2 id="grp-alpha-banner">Group Alpha Shell</h2>
      <span id="grp-alpha-shell-seq">{s.grpAlphaShellSeq}</span>
      <CubeClientProbe id="grp-alpha" />
      <DinouCacheSlot
        id="cube-grp-alpha-slot"
        revalidate={3600}
        tags={["cube-grp-alpha-slot-tag"]}
      >
        {async () => (
          <span id="grp-alpha-slot-seq">{readCubeState().grpAlphaSlotSeq}</span>
        )}
      </DinouCacheSlot>
      <Suspense fallback={<span id="grp-alpha-hole-fb">loading-alpha</span>}>
        <GrpAlphaHole />
      </Suspense>
      <nav id="grp-alpha-nav" style={{ display: "flex", gap: 8 }}>
        <Link id="link-grp-to-promo" href="/t-3d-cube/group-collision/promo">
          Promo
        </Link>
        <Link id="link-grp-to-promo2" href="/t-3d-cube/group-collision/promo2">
          Promo 2
        </Link>
        <Link id="link-grp-to-settings" href="/t-3d-cube/group-collision/settings">
          Settings (Beta)
        </Link>
      </nav>
      <main id="grp-alpha-main">{children}</main>
    </section>
  );
}
