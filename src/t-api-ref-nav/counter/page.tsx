import { Link } from "./dinou";

let counterHits = 0;

export default function ApiRefNavCounterPage() {
  counterHits += 1;
  const token = `${counterHits}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <main data-testid="api-nav-counter-page">
      <div data-testid="api-nav-counter-token">{token}</div>
      <Link to=".." data-testid="api-nav-counter-back">
        Back to Hub
      </Link>
      <div style={{ height: "1200px" }} />
      <section id="target-sec" data-testid="api-nav-target-sec">
        Target Hash Section
      </section>
    </main>
  );
}
