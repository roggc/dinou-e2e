import { ClientSearchWidget } from "../ClientSearchWidget";

let ssgRenderCount = 0;

export default function BailoutSsgPage() {
  ssgRenderCount++;
  return (
    <section>
      <h1 data-testid="ssg-render-count">SSG:{ssgRenderCount}</h1>
      <ClientSearchWidget />
    </section>
  );
}
