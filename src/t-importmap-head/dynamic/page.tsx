import { getContext } from "dinou/server";
import { InteractiveCounter } from "../InteractiveCounter";

let dynamicRenderSeq = 0;

export default function ImportmapHeadDynamicPage() {
  const { req } = getContext();
  const q = String(req.query.q || "default");
  dynamicRenderSeq += 1;

  return (
    <main data-testid="importmap-head-dynamic-page">
      <h1 data-testid="importmap-dynamic-heading">Dynamic — Dinou 🚀</h1>
      <p data-testid="importmap-dynamic-query">{`Query:${q}`}</p>
      <p data-testid="importmap-dynamic-seq">{`Seq:${dynamicRenderSeq}`}</p>
      <InteractiveCounter label="dynamic" />
    </main>
  );
}
