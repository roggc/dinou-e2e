import serverHeroAvifUrl from "./media/server-only-hero.avif";
import streamClipUrl from "./media/stream-clip.mp4";
import cubeGlbUrl from "@media/cube.glb";
import skyboxHdrUrl from "@media/skybox.hdr";
import headerLogoUrl from "./media/header/logo.svg";
import footerLogoUrl from "./media/footer/logo.svg";
import specialBannerUrl from "./media/Special Banner (2x).SVG";
import { MediaClientViewer } from "./MediaClientViewer";

export default function AssetsPipelinePage() {
  return (
    <main
      data-testid="t-assets-page"
      data-server-hero={serverHeroAvifUrl}
      data-stream-clip={streamClipUrl}
      data-cube-glb={cubeGlbUrl}
      data-skybox-hdr={skyboxHdrUrl}
      data-header-logo={headerLogoUrl}
      data-footer-logo={footerLogoUrl}
      data-special-banner={specialBannerUrl}
    >
      <h1>Static Media &amp; Custom Asset Extensions E2E</h1>
      <img
        data-testid="t-assets-header-logo-img"
        src={headerLogoUrl}
        alt="Header Logo"
      />
      <img
        data-testid="t-assets-footer-logo-img"
        src={footerLogoUrl}
        alt="Footer Logo"
      />
      <img
        data-testid="t-assets-special-banner-img"
        src={specialBannerUrl}
        alt="Special Banner"
      />
      <div
        data-testid="t-assets-css-header-logo"
        className="t-assets-css-header-logo"
      />
      <MediaClientViewer />
    </main>
  );
}

