import { getContext } from "./dinou";
import { PluginRpcBox } from "./PluginRpcBox";

export default function TPluginsLiveDashboardPage() {
  const ctx = getContext() as Record<string, unknown>;
  const authUser = ctx?.pluginAuthUser as
    | {
        id?: string;
        name?: string;
        version?: string;
        logicalPath?: string;
        isRscRequest?: boolean;
      }
    | undefined;

  return (
    <main
      data-testid="t-plugins-live-dashboard"
      data-user-id={authUser?.id ?? "missing"}
      data-user-name={authUser?.name ?? "Guest"}
      data-plugin-version={authUser?.version ?? "missing"}
      data-logical-path={authUser?.logicalPath ?? "missing"}
    >
      <h1 id="t-plugins-live-dashboard-heading">
        Welcome {authUser?.name ?? "Guest"}
      </h1>
      <PluginRpcBox />
    </main>
  );
}

