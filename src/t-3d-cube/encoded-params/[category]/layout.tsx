import type { ReactNode } from "react";
import { readCubeState } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

export default function EncodedCategoryLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { category: string };
}) {
  const st = readCubeState();
  const cat = params?.category || "";
  const seq =
    cat === "café"
      ? st.encCatCafeSeq
      : cat === "hello world"
        ? st.encCatHelloSeq
        : st.encCatTokyoSeq;

  return (
    <section id="enc-cat-l2-shell" data-category={cat}>
      <h2>{`Category L2: ${cat}`}</h2>
      <span id="enc-cat-param">{cat}</span>
      <span id="enc-cat-l2-seq">{seq}</span>
      <CubeClientProbe id="enc-l2" />
      <div id="enc-cat-outlet">{children}</div>
    </section>
  );
}
