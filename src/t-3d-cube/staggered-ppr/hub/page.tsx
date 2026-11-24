import { Link } from "dinou";
import { readCubeState } from "../../shared/cube-state";

export default function StaggeredHubPage() {
  const s = readCubeState();
  return (
    <article id="stag-hub-page">
      <h3>Staggered PPR Hub</h3>
      <span id="stag-hub-seq">{s.stagHubSeq}</span>
      <nav style={{ display: "flex", gap: 8, margin: "6px 0" }}>
        <Link
          id="link-hub-to-stag-abort"
          href="/t-3d-cube/staggered-ppr?tag=softabort&fastMs=15&slowMs=2200"
          prefetch={false}
        >
          Soft Nav to Staggered (Abort 2200ms)
        </Link>
        <Link
          id="link-hub-to-stag-slot"
          href="/t-3d-cube/staggered-ppr?tag=softslot&fastMs=15&slowMs=1800"
          prefetch={false}
        >
          Soft Nav to Staggered (Mid-Stream Slot 1800ms)
        </Link>
      </nav>
    </article>
  );
}
