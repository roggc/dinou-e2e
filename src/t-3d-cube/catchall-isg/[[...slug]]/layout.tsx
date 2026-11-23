import { Suspense, type ReactNode } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

function resolveSlugKey(slug?: string[]): "root" | "docs" | "docs-v2" {
  const joined = Array.isArray(slug) && slug.length > 0 ? slug.join("-") : "root";
  if (joined === "docs") return "docs";
  if (joined === "docs-v2") return "docs-v2";
  return "root";
}

function readL2Seqs(slugKey: "root" | "docs" | "docs-v2") {
  const s = readCubeState();
  if (slugKey === "docs") {
    return {
      shell: s.caDocsLayoutShellSeq,
      slot: s.caDocsLayoutSlotSeq,
      hole: s.caDocsLayoutHoleSeq,
    };
  }
  if (slugKey === "docs-v2") {
    return {
      shell: s.caDocsV2LayoutShellSeq,
      slot: s.caDocsV2LayoutSlotSeq,
      hole: s.caDocsV2LayoutHoleSeq,
    };
  }
  return {
    shell: s.caRootLayoutShellSeq,
    slot: s.caRootLayoutSlotSeq,
    hole: s.caRootLayoutHoleSeq,
  };
}

async function CatchAllL2Hole({ slugKey }: { slugKey: "root" | "docs" | "docs-v2" }) {
  const tag = String(getContext()?.req?.query?.q || "base");
  await cubeSleep(10);
  const seqs = readL2Seqs(slugKey);
  return (
    <span id="ca-l2-hole-seq">
      {`${slugKey}:${tag}-${seqs.hole}`}
    </span>
  );
}

export default function CatchAllSlugLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { slug?: string[] };
}) {
  const slugKey = resolveSlugKey(params?.slug);
  const seqs = readL2Seqs(slugKey);
  const slotId = `cube-ca-l2-slot-${slugKey}`;

  return (
    <div id="ca-l2-layout" data-slug-key={slugKey}>
      <span id="ca-l2-slug-key">{slugKey}</span>
      <span id="ca-l2-shell-seq">{seqs.shell}</span>
      <CubeClientProbe id={`ca-l2-${slugKey}`} />
      <DinouCacheSlot id={slotId} revalidate={3600} tags={[`${slotId}-tag`]}>
        {async () => (
          <span id="ca-l2-slot-seq">{readL2Seqs(slugKey).slot}</span>
        )}
      </DinouCacheSlot>
      <Suspense fallback={<span>loading-ca-l2</span>}>
        <CatchAllL2Hole slugKey={slugKey} />
      </Suspense>
      <main id="ca-l2-main">{children}</main>
    </div>
  );
}
