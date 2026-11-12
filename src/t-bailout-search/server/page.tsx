import { useSearchParams } from "dinou";

let serverRenderCount = 0;

export default function BailoutServerSearchPage() {
  serverRenderCount++;
  const searchParams = useSearchParams();
  return (
    <section>
      <h1 data-testid="server-render-count">Server:{serverRenderCount}</h1>
      <p data-testid="server-search-value">
        ServerSearch:{searchParams.get("q") ?? "NONE"}
      </p>
    </section>
  );
}
