import { defineConfig } from "dinou/config";
import { Link } from "./dinou";
import { EjectClientCard } from "./EjectClientCard";

const sampleEjectedConfig = defineConfig({
  reactStrictMode: true,
});

export default function EjectPage() {
  const strictFlag = String(Boolean(sampleEjectedConfig.reactStrictMode));
  return (
    <main data-testid="eject-page-root" data-config-strict={strictFlag}>
      <h1 data-testid="eject-heading">Dinou Eject &amp; Uneject Sovereignty</h1>
      <EjectClientCard />
      <nav>
        <Link to="/t-eject/live?mode=spa" data-testid="eject-nav-live">
          Open Live Ejected SSR
        </Link>
      </nav>
    </main>
  );
}

