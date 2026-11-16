"use client";

import { useEffect, useState } from "react";
import { inspectServerEnvRpc } from "./actions";

export function ClientEnvInspector({ idPrefix }: { idPrefix: string }) {
  const directPublicTitle =
    process.env.DINOU_PUBLIC_E2E_APP_TITLE ?? "missing";
  const directPublicOrigin =
    process.env.DINOU_PUBLIC_E2E_API_ORIGIN ?? "missing";
  const clientNodeEnv = process.env.NODE_ENV ?? "missing";

  // Direct member access on unprefixed server secret MUST evaluate to undefined in SSR & Browser
  const directLeakProbe = String(process.env.E2E_ENV_PRIVATE_SECRET);

  // Object destructuring on process.env MUST preserve DINOU_PUBLIC_* and evaluate private keys to undefined
  const {
    DINOU_PUBLIC_E2E_APP_TITLE: destructuredPublicTitle,
    DINOU_PUBLIC_E2E_API_ORIGIN: destructuredPublicOrigin,
    E2E_ENV_PRIVATE_SECRET: destructuredSecret,
  } = process.env;

  const hasNoPrivateKeys = Object.keys(process.env).every(
    (k) => !k.startsWith("E2E_ENV_")
  );

  const [browserState, setBrowserState] = useState<{
    hydrated: boolean;
    browserTypeofProcess: string;
  }>({
    hydrated: false,
    browserTypeofProcess: "ssr",
  });

  const [rpcPayload, setRpcPayload] = useState<string>("idle");

  useEffect(() => {
    setBrowserState({
      hydrated: true,
      browserTypeofProcess: typeof process,
    });
  }, []);

  async function handleRpcProbe() {
    const res = await inspectServerEnvRpc(`${idPrefix}-rpc`);
    setRpcPayload(JSON.stringify(res));
  }

  return (
    <div
      data-testid={`${idPrefix}-client-env`}
      data-public-title={directPublicTitle}
      data-public-origin={directPublicOrigin}
      data-destructured-title={destructuredPublicTitle ?? "missing"}
      data-destructured-origin={destructuredPublicOrigin ?? "missing"}
      data-client-node-env={clientNodeEnv}
      data-leak-direct={directLeakProbe}
      data-leak-destructured={String(destructuredSecret)}
      data-no-private-keys={String(hasNoPrivateKeys)}
      data-client-hydrated={String(browserState.hydrated)}
      data-browser-typeof-process={browserState.browserTypeofProcess}
    >
      <p id={`${idPrefix}-public-title`}>{directPublicTitle}</p>
      <p id={`${idPrefix}-public-origin`}>{directPublicOrigin}</p>
      <p id={`${idPrefix}-leak-direct`}>{directLeakProbe}</p>
      <p id={`${idPrefix}-leak-destructured`}>{String(destructuredSecret)}</p>
      <button
        id={`${idPrefix}-rpc-btn`}
        type="button"
        onClick={handleRpcProbe}
      >
        Probe Server Action Env
      </button>
      <pre id={`${idPrefix}-rpc-result`}>{rpcPayload}</pre>
    </div>
  );
}

