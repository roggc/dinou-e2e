import { ClientSearchWidget } from "../ClientSearchWidget";

let isrRenderCount = 0;

export default function BailoutIsrPage() {
  isrRenderCount++;
  return (
    <section>
      <h1 data-testid="isr-render-count">ISR:{isrRenderCount}</h1>
      <ClientSearchWidget />
    </section>
  );
}
