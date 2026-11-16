import serverHeroAvifUrl from "../media/server-only-hero.avif";
import cubeGlbUrl from "@media/cube.glb";
import skyboxHdrUrl from "@media/skybox.hdr";
import liveHmrBadgeUrl from "../media/live-hmr-badge.svg";
import { MediaClientViewer } from "../MediaClientViewer";
import { HmrAssetBox } from "./HmrAssetBox";

export default function AssetsDynamicSlugPage({
  params,
}: {
  params: { slug: string };
}) {
  return (
    <main
      data-testid="t-assets-dyn-page"
      data-slug={params.slug}
      data-server-hero={serverHeroAvifUrl}
      data-cube-glb={cubeGlbUrl}
      data-skybox-hdr={skyboxHdrUrl}
      data-server-hmr-badge={liveHmrBadgeUrl}
    >
      <h1 data-testid="t-assets-dyn-slug">Slug:{params.slug}</h1>
      <MediaClientViewer />
      <HmrAssetBox />
    </main>
  );
}

