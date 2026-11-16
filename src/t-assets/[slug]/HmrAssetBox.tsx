"use client";
import liveHmrBadgeUrl from "../media/live-hmr-badge.svg";

export function HmrAssetBox() {
  return (
    <div
      data-testid="t-assets-dyn-client-hmr"
      data-hmr-badge={liveHmrBadgeUrl}
    >
      <img
        data-testid="t-assets-dyn-client-hmr-img"
        src={liveHmrBadgeUrl}
        alt="Live HMR Badge"
      />
    </div>
  );
}

