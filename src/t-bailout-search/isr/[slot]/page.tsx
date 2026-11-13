import type { PageProps } from "./dinou";
import { ClientSearchWidget } from "../../ClientSearchWidget";

let processBootId: string | null = null;
const isrSlotCounts = new Map<string, number>();

export default function BailoutIsrSlotPage({ params }: PageProps) {
  if (!processBootId) {
    processBootId = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .padEnd(4, "0")}`;
  }
  const next = (isrSlotCounts.get(params.slot) ?? 0) + 1;
  isrSlotCounts.set(params.slot, next);
  return (
    <section>
      <h1 data-testid="isr-render-count">{`ISR:${params.slot}:${processBootId}:${next}`}</h1>
      <ClientSearchWidget />
    </section>
  );
}
