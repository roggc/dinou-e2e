import { Link } from "./dinou";

export default function TPluginsIndexPage() {
  const g = globalThis as Record<string, unknown>;
  const buildOrRenderSetupLog = Array.isArray(g.__E2E_PLUGINS_SETUP_LOG__)
    ? (g.__E2E_PLUGINS_SETUP_LOG__ as string[]).join(",")
    : "none";

  return (
    <main
      data-testid="t-plugins-index-page"
      data-setup-log={buildOrRenderSetupLog}
    >
      <h1 id="t-plugins-home-heading">Dinou v9.4.0 Plugins Suite</h1>
      <nav>
        <ul>
          <li>
            <Link
              to="/t-plugins/dashboard"
              id="link-protected-ssg-dashboard"
            >
              Protected SSG Dashboard
            </Link>
          </li>
          <li>
            <Link
              to="/t-plugins/dashboard/live"
              id="link-protected-layout-live"
            >
              Protected Nested-Layout Live Dashboard
            </Link>
          </li>
          <li>
            <Link to="/t-plugins/res-redirect" id="link-res-redirect">
              Context.res.redirect Route
            </Link>
          </li>
        </ul>
      </nav>
    </main>
  );
}

