"use client";

import { useState } from "react";
import { ClientRedirect, useRouter, type DinouRoute } from "dinou";
import {
  z2ThrowInternalSecret,
  z2ThrowDigestError,
  z2SafeRedirect,
} from "./actions";

export function SecurityProbeClient() {
  const router = useRouter();
  const [sfErrMsg, setSfErrMsg] = useState("idle");
  const [sfErrDigest, setSfErrDigest] = useState("none");
  const [clientRedirTarget, setClientRedirTarget] = useState<string | null>(null);
  const [routerProbeStatus, setRouterProbeStatus] = useState("idle");

  return (
    <section data-testid="z2-client-probes">
      <p data-testid="z2-sf-err-msg">{sfErrMsg}</p>
      <p data-testid="z2-sf-err-digest">{sfErrDigest}</p>
      <p data-testid="z2-router-probe-status">{routerProbeStatus}</p>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          type="button"
          data-testid="z2-btn-sf-secret-err"
          onClick={async () => {
            try {
              await z2ThrowInternalSecret();
            } catch (err: any) {
              setSfErrMsg(err?.message || "caught-empty");
              setSfErrDigest(err?.digest || "none");
            }
          }}
        >
          Trigger SF Secret Error
        </button>

        <button
          type="button"
          data-testid="z2-btn-sf-digest-err"
          onClick={async () => {
            try {
              await z2ThrowDigestError();
            } catch (err: any) {
              setSfErrMsg(err?.message || "caught-empty");
              setSfErrDigest(err?.digest || "none");
            }
          }}
        >
          Trigger SF Digest Error
        </button>

        <button
          type="button"
          data-testid="z2-btn-router-malicious"
          onClick={() => {
            router.push("javascript:window.__Z2_XSS__=1" as DinouRoute);
            router.push("data:text/html,<script>window.__Z2_XSS__=1</script>" as DinouRoute);
            router.push("//evil.example/pwn" as DinouRoute);
            router.push("/\\evil.example/pwn" as DinouRoute);
            setRouterProbeStatus("blocked-ok");
          }}
        >
          Probe Router Malicious Redirects
        </button>

        <button
          type="button"
          data-testid="z2-btn-client-redirect-backslash"
          onClick={() => setClientRedirTarget("/\\evil.example/pwn")}
        >
          Mount Malicious ClientRedirect
        </button>

        <button
          type="button"
          data-testid="z2-btn-sf-redirect-backslash"
          onClick={async () => {
            await z2SafeRedirect("/\\evil.example/pwn");
          }}
        >
          Trigger Malicious SF Redirect
        </button>
      </div>

      {clientRedirTarget ? <ClientRedirect to={clientRedirTarget} /> : null}
    </section>
  );
}
