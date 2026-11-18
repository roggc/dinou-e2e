import { getContext } from "dinou/server";
import { Link } from "./dinou";

export default function EjectLivePage() {
  const { req, env } = getContext();
  const mode = String(req.query.mode || "direct");
  const secretOk = Boolean(env.E2E_ENV_PRIVATE_SECRET);

  return (
    <main
      data-testid="eject-live-root"
      data-mode={mode}
      data-secret-ok={String(secretOk)}
    >
      <h1 data-testid="eject-live-heading">Live Ejected Mode: {mode}</h1>
      <Link to="/t-eject" data-testid="eject-back-link">
        Back to Eject Overview
      </Link>
    </main>
  );
}

