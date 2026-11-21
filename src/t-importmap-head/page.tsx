import { Link } from "./dinou";
import { InteractiveCounter } from "./InteractiveCounter";

export default function ImportmapHeadSsgPage() {
  return (
    <main data-testid="importmap-head-ssg-page">
      <h1 data-testid="importmap-head-heading">Hola — Dinou 🚀</h1>
      <p data-testid="importmap-head-mode">SSG Standards Mode</p>
      <InteractiveCounter label="ssg" />
      <nav>
        <Link to="/t-importmap-head/dynamic" data-testid="importmap-link-dynamic">
          Dynamic SSR
        </Link>
        <Link to="/t-importmap-head/ppr" data-testid="importmap-link-ppr">
          PPR Route
        </Link>
      </nav>
    </main>
  );
}
