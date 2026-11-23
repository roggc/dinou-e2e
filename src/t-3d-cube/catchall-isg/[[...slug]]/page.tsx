import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState, cubeSleep } from "../../shared/cube-state";
import { CubeControlBridge } from "../../shared/cube-client";

function resolveSlugKey(slug?: string[]): "root" | "docs" | "docs-v2" {
  const joined = Array.isArray(slug) && slug.length > 0 ? slug.join("-") : "root";
  if (joined === "docs") return "docs";
  if (joined === "docs-v2") return "docs-v2";
  return "root";
}

function readPageSeqs(slugKey: "root" | "docs" | "docs-v2") {
  const s = readCubeState();
  if (slugKey === "docs") {
    return { shell: s.caDocsPageShellSeq, hole: s.caDocsPageHoleSeq };
  }
  if (slugKey === "docs-v2") {
    return { shell: s.caDocsV2PageShellSeq, hole: s.caDocsV2PageHoleSeq };
  }
  return { shell: s.caRootPageShellSeq, hole: s.caRootPageHoleSeq };
}

async function CatchAllPageHole({ slugKey }: { slugKey: "root" | "docs" | "docs-v2" }) {
  const tag = String(getContext()?.req?.query?.q || "base");
  await cubeSleep(10);
  const seqs = readPageSeqs(slugKey);
  return (
    <span id="ca-page-hole-seq">
      {`${slugKey}:${tag}-${seqs.hole}`}
    </span>
  );
}

export default function CatchAllSlugPage({
  params,
}: {
  params: { slug?: string[] };
}) {
  const slugKey = resolveSlugKey(params?.slug);
  const seqs = readPageSeqs(slugKey);

  return (
    <article id="ca-page" data-slug-key={slugKey}>
      <span id="ca-page-slug-key">{slugKey}</span>
      <span id="ca-page-shell-seq">{seqs.shell}</span>
      <Suspense fallback={<span>loading-ca-page</span>}>
        <CatchAllPageHole slugKey={slugKey} />
      </Suspense>
      <CubeControlBridge />
    </article>
  );
}
