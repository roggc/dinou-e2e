import { Link } from "./dinou";
import { NavRefClientControls } from "./NavRefClientControls";

export default function ApiRefNavHubPage() {
  return (
    <main data-testid="api-nav-hub">
      <h1 data-testid="api-nav-heading">API Reference Navigation Hub</h1>
      <NavRefClientControls />
      <p>
        <Link to="ppr-search" data-testid="api-nav-link-ppr-search">
          PPR Search Probe
        </Link>
      </p>
    </main>
  );
}
