import type { PageProps } from "./dinou";
import { ClientSearchWidget } from "../../ClientSearchWidget";

const isrSlotCounts = new Map<string, number>();

export default function BailoutIsrSlotPage({ params }: PageProps) {
  const next = (isrSlotCounts.get(params.slot) ?? 0) + 1;
  isrSlotCounts.set(params.slot, next);
  return (
    <section>
      <h1 data-testid="isr-render-count">{`ISR:${params.slot}:${next}`}</h1>
      <ClientSearchWidget />
    </section>
  );
}
