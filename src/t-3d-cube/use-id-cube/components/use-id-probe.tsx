"use client";

import { useId, type ReactNode } from "react";

export function ClientUseIdProbe({
  owner,
  seq,
}: {
  owner: string;
  seq: number;
}) {
  const id = useId();
  return (
    <div
      data-uid-client={owner}
      data-uid-val={id}
      style={{ display: "inline-flex", gap: 4, margin: 2 }}
    >
      <label data-uid-label={owner} htmlFor={id}>
        {owner}
      </label>
      <input
        id={id}
        data-uid-input={owner}
        value={`${owner}:${seq}`}
        readOnly
      />
      <code data-uid-text={owner}>{id}</code>
      <span data-uid-seq={owner}>{seq}</span>
    </div>
  );
}

export function ClientUseIdAncestorWrapper({
  owner,
  children,
}: {
  owner: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div
      data-uid-client={owner}
      data-uid-val={id}
      style={{ border: "1px dashed #64748b", padding: 4, margin: 2 }}
    >
      <label data-uid-label={owner} htmlFor={id}>
        {owner}
      </label>
      <input id={id} data-uid-input={owner} value={`wrap:${owner}`} readOnly />
      <code data-uid-text={owner}>{id}</code>
      <div data-uid-wrap-body={owner}>{children}</div>
    </div>
  );
}
