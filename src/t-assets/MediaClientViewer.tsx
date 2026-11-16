"use client";
import { useState } from "react";
import relBadgeUrl from "./media/client-rel-badge.svg";
import streamClipUrl from "./media/stream-clip.mp4";
import cubeGlbUrl from "@media/cube.glb";
import sceneGltfUrl from "@media/scene.gltf";

export function MediaClientViewer() {
  const [clicks, setClicks] = useState(0);
  return (
    <div
      data-testid="t-assets-client-viewer"
      data-rel-badge={relBadgeUrl}
      data-stream-clip={streamClipUrl}
      data-cube-glb={cubeGlbUrl}
      data-scene-gltf={sceneGltfUrl}
    >
      <img
        data-testid="t-assets-client-badge-img"
        src={relBadgeUrl}
        alt="Client Relative Badge"
      />
      <button
        type="button"
        data-testid="t-assets-client-counter"
        onClick={() => setClicks((c) => c + 1)}
      >
        Clicks:{clicks}
      </button>
    </div>
  );
}

