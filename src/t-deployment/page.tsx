import { Link } from "./dinou";
import { DeploymentClientProbe } from "./DeploymentClientProbe";

export default function DeploymentTargetPage() {
  const buildTool = process.env.DINOU_BUILD_TOOL || "dev";
  return (
    <main data-testid="deploy-ssg-root">
      <h1 data-testid="deploy-ssg-heading" data-build-tool={buildTool}>
        Deployment Targets Parity
      </h1>
      <DeploymentClientProbe />
      <nav>
        <Link to="/t-deployment/dynamic?probe=spa" data-testid="deploy-nav-dynamic">
          Go Dynamic SSR
        </Link>
        <Link
          to="/t-deployment/isg/[slug]"
          params={{ slug: "edge-ready" }}
          data-testid="deploy-nav-isg"
        >
          Go On-Demand ISG
        </Link>
      </nav>
    </main>
  );
}
