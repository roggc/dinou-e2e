import type { ReactNode } from "react";
import { getContext } from "dinou";
import { readCubeState } from "../../shared/cube-state";

export default function CubeHsImpCookieL2Layout({
  children,
}: {
  children: ReactNode;
}) {
  const ctx = getContext();
  const user = String(ctx?.req?.cookies?.hs_imp_user || "anon");
  const st = readCubeState();
  return (
    <div id="cube-hsimp-l2">
      <span id="hsimp-l2-seq">{st.hsImpL2Seq}</span>
      <span id="hsimp-l2-user">{user}</span>
      <div>{children}</div>
    </div>
  );
}
