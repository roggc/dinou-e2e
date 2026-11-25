import type { ReactNode } from "react";
import { CubeControlBridge } from "../../shared/cube-client";

export default function TtlMidIsrBailoutLayout({ children }: { children: ReactNode }) {
  return (
    <section id="ttl-bailout-layout">
      <CubeControlBridge />
      {children}
    </section>
  );
}
