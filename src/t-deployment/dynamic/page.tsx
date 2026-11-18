import { getContext } from "dinou/server";
import { Link } from "./dinou";

export default function DeploymentDynamicPage() {
  const { req, env } = getContext();
  const probe = String(req.query.probe || "direct");
  const region = String(env.NETLIFY_REGION || "standard");
  const hasSecret = Boolean(env.E2E_ENV_PRIVATE_SECRET);
  const buildTool = process.env.DINOU_BUILD_TOOL || "dev";

  return (
    <main
      data-testid="deploy-dynamic-root"
      data-probe={probe}
      data-region={region}
      data-secret-ok={String(hasSecret)}
      data-build-tool={buildTool}
    >
      <h1 data-testid="deploy-dynamic-heading">Dynamic Probe: {probe}</h1>
      <p data-testid="deploy-dynamic-region">Region: {region}</p>
      <Link href="/t-deployment" data-testid="deploy-back-home">
        Back to Deployment Home
      </Link>
    </main>
  );
}

