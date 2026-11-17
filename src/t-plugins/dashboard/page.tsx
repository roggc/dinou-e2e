import { getContext } from "./dinou";

export default function TPluginsProtectedSsgDashboardPage() {
  const ctx = getContext() as Record<string, unknown>;
  const authUser = ctx?.pluginAuthUser as
    | { id?: string; name?: string; version?: string }
    | undefined;

  return (
    <main
      data-testid="t-plugins-ssg-dashboard"
      data-ssg-rendered-user={authUser?.name ?? "ssg-build-unblocked"}
    >
      <h1 id="t-plugins-ssg-dashboard-heading">
        Protected SSG Dashboard ({authUser?.name ?? "Prerendered Shell"})
      </h1>
    </main>
  );
}

