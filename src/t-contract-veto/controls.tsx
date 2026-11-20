"use client";

import { useState } from "react";
import { getContractValidationLog, setContractVetoState } from "./actions";

export function VetoControls() {
  const [tenant, setTenant] = useState("acme");
  const [status, setStatus] = useState("ready");
  const [logText, setLogText] = useState("[]");

  return (
    <div data-testid="veto-controls">
      <input
        type="text"
        data-testid="veto-tenant-input"
        aria-label="Target tenant"
        value={tenant}
        onChange={(e) => setTenant(e.target.value)}
      />
      <span data-testid="veto-status">{status}</span>
      <span data-testid="veto-validation-log">{logText}</span>
      <button
        type="button"
        data-testid="deactivate-item"
        onClick={async () => {
          await setContractVetoState({
            tenant,
            tenantActive: true,
            itemActive: false,
            resetLog: true,
          });
          setStatus(`item-off:${tenant}`);
        }}
      >
        Deactivate Item
      </button>
      <button
        type="button"
        data-testid="deactivate-tenant"
        onClick={async () => {
          await setContractVetoState({
            tenant,
            tenantActive: false,
            itemActive: true,
            resetLog: true,
          });
          setStatus(`tenant-off:${tenant}`);
        }}
      >
        Deactivate Tenant
      </button>
      <button
        type="button"
        data-testid="reset-veto"
        onClick={async () => {
          await setContractVetoState({
            tenant,
            tenantActive: true,
            itemActive: true,
            resetLog: true,
          });
          setStatus(`reset:${tenant}`);
        }}
      >
        Reset
      </button>
      <button
        type="button"
        data-testid="read-validation-log"
        onClick={async () => {
          const entries = await getContractValidationLog(tenant);
          setLogText(JSON.stringify(entries));
        }}
      >
        Read Validation Log
      </button>
    </div>
  );
}
