import type { ReactNode } from "react";
import { Link } from "dinou";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";
import { EncodedParamsBridge } from "./enc-controls";

export default function EncodedParamsL1Layout({
  children,
}: {
  children: ReactNode;
}) {
  const st = readCubeState();

  return (
    <section id="enc-l1-shell">
      <h1>Encoded &amp; Unicode 3D Cube L1</h1>
      <span id="enc-l1-shell-seq">{st.encL1ShellSeq}</span>
      <CubeClientProbe id="enc-l1" />
      <CubeControlBridge />
      <EncodedParamsBridge />
      <nav style={{ display: "flex", gap: 8, margin: "8px 0" }}>
        <Link
          id="link-enc-cafe"
          href="/t-3d-cube/encoded-params/[category]/[slug]"
          params={{ category: "café", slug: "crème brûlée" }}
        >
          Café / Crème Brûlée
        </Link>
        <Link
          id="link-enc-hello"
          href="/t-3d-cube/encoded-params/[category]/[slug]"
          params={{ category: "hello world", slug: "c++ guide" }}
        >
          Hello World / C++ Guide
        </Link>
        <Link
          id="link-enc-tokyo"
          href="/t-3d-cube/encoded-params/[category]/[slug]"
          params={{ category: "東京", slug: "ramen bowl" }}
        >
          東京 / Ramen Bowl
        </Link>
      </nav>
      <div id="enc-l1-outlet">{children}</div>
    </section>
  );
}
