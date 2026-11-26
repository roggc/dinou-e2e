import { Suspense } from "react";
import { DinouCacheSlot, getContext } from "dinou/server";
import { readCubeState } from "../../../shared/cube-state";

function pickSeqs(slug: string) {
  const st = readCubeState();
  if (slug === "crème brûlée") {
    return {
      shell: st.encSlugCremeShellSeq,
      hole: st.encSlugCremeHoleSeq,
      slot: st.encSlugCremeSlotSeq,
    };
  }
  if (slug === "c++ guide") {
    return {
      shell: st.encSlugCppShellSeq,
      hole: st.encSlugCppHoleSeq,
      slot: st.encSlugCppSlotSeq,
    };
  }
  return {
    shell: st.encSlugRamenShellSeq,
    hole: st.encSlugRamenHoleSeq,
    slot: st.encSlugRamenSlotSeq,
  };
}

async function EncodedDynamicHole({
  category,
  slug,
}: {
  category: string;
  slug: string;
}) {
  const reqTag = String(getContext()?.req?.headers?.["x-enc-hole"] || "live");
  const seqs = pickSeqs(slug);
  return (
    <div id="enc-page-hole" data-req-tag={reqTag}>
      <span id="enc-hole-category">{category}</span>
      <span id="enc-hole-slug">{slug}</span>
      <span id="enc-hole-seq">{seqs.hole}</span>
    </div>
  );
}

export default function EncodedSlugPage({
  params,
}: {
  params: { category: string; slug: string };
}) {
  const category = params?.category || "";
  const slug = params?.slug || "";
  const seqs = pickSeqs(slug);
  const slotId = `enc-slot-${category}-${slug}`;
  const slotTag = `enc-slot-tag-${slug}`;

  return (
    <article id="enc-slug-page" data-category={category} data-slug={slug}>
      <h3>{`${category} / ${slug}`}</h3>
      <span id="enc-page-category">{category}</span>
      <span id="enc-page-slug">{slug}</span>
      <span id="enc-page-shell-seq">{seqs.shell}</span>

      <DinouCacheSlot id={slotId} tags={[slotTag]} revalidate={3600}>
        {async () => {
          const live = pickSeqs(slug);
          return (
            <div id="enc-page-slot" data-slot-id={slotId}>
              <span id="enc-page-slot-seq">{live.slot}</span>
            </div>
          );
        }}
      </DinouCacheSlot>

      <Suspense fallback={<div id="enc-hole-fb">Loading Encoded Hole...</div>}>
        <EncodedDynamicHole category={category} slug={slug} />
      </Suspense>
    </article>
  );
}
