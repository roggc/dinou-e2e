import type { PageProps } from "./dinou";
import { ClientSearchWidget } from "../../ClientSearchWidget";

const renderCounts = new Map<string, number>();

export default function BailoutIsgPage({ params }: PageProps) {
  const next = (renderCounts.get(params.id) ?? 0) + 1;
  renderCounts.set(params.id, next);
  return (
    <section>
      <h1 data-testid="isg-render-count">{`ISG:${params.id}:${next}`}</h1>
      <ClientSearchWidget />
    </section>
  );
}
