import { getContext, Link } from "./dinou";
import { ChildContextualNav } from "./child-nav";

export default function ContextualRouterChildPage() {
  const ctx = getContext();

  return (
    <main data-testid="ctx-router-child">
      <h1>Contextual Child</h1>
      <div data-testid="ctx-path">{ctx.req.path}</div>
      <div data-testid="ctx-raw-path">{ctx.req.rawPath ?? "missing"}</div>
      <div data-testid="ctx-is-rsc">{String(ctx.req.isRscRequest)}</div>
      <div data-testid="ctx-plugin-user">{ctx.user?.name ?? "missing"}</div>
      <ChildContextualNav />
      <Link to=".." data-testid="ctx-child-back-link">
        Back Link
      </Link>
    </main>
  );
}
