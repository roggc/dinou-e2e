"use client";

import { useState } from "react";
import { probeDeploymentAction } from "./actions";

export function DeploymentClientProbe() {
  const [reply, setReply] = useState("idle");
  const [rpcMeta, setRpcMeta] = useState("none");

  return (
    <section data-testid="deploy-client-probe">
      <span data-testid="deploy-public-title">
        {process.env.DINOU_PUBLIC_E2E_APP_TITLE || "unset"}
      </span>
      <button
        type="button"
        data-testid="deploy-rpc-btn"
        onClick={async () => {
          const res = await probeDeploymentAction("deploy-rpc");
          setReply(`${res.echoed}|secret:${res.hasSecret}|region:${res.netlifyRegion}`);
          setRpcMeta(`${res.buildTool}:${res.runtime}`);
        }}
      >
        Invoke Deployment Action
      </button>
      <p data-testid="deploy-rpc-reply">{reply}</p>
      <p data-testid="deploy-rpc-meta">{rpcMeta}</p>
    </section>
  );
}

