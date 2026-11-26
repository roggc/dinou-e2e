import { readCubeState } from "../../shared/cube-state";

export default function BrokenEdgeRacesPage() {
  const s = readCubeState();
  if (s.erShouldThrowError) {
    throw new Error("ER_DELIBERATE_ERROR");
  }
  return <section id="er-broken-ok">healthy</section>;
}
