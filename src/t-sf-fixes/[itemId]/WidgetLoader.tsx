"use client";

import { useState, type ReactNode } from "react";
import clientModDefault, { helperNamedAction } from "./defaultModAction";
import clientFnDefault from "./defaultFnAction";
import clientAnonModDefault from "./defaultAnonModAction";
import { streamCard } from "./streamActions";

export function WidgetLoader({
  itemId,
  serverModDefault,
  serverFnDefault,
  serverAnonModDefault,
  serverInlineAction,
}: {
  itemId: string;
  serverModDefault: (label: string) => Promise<string>;
  serverFnDefault: (count: number) => Promise<string>;
  serverAnonModDefault: (tag: string) => Promise<string>;
  serverInlineAction: (suffix: string) => Promise<string>;
}) {
  const [serverPropsResult, setServerPropsResult] = useState("");
  const [clientImportsResult, setClientImportsResult] = useState("");
  const [inlineResult, setInlineResult] = useState("");
  const [streamedUi, setStreamedUi] = useState<ReactNode>(null);

  return (
    <div data-testid="sf-fixes-widget">
      <button
        type="button"
        data-testid="btn-server-passed-defaults"
        onClick={async () => {
          const [r1, r2, r3] = await Promise.all([
            serverModDefault("srv"),
            serverFnDefault(7),
            serverAnonModDefault("anon-srv"),
          ]);
          setServerPropsResult(`${r1}|${r2}|${r3}`);
        }}
      >
        Run Server-Passed Default Actions
      </button>
      <p data-testid="server-passed-defaults-result">{serverPropsResult}</p>

      <button
        type="button"
        data-testid="btn-client-imported-defaults"
        onClick={async () => {
          const [r1, r2, r3, r4] = await Promise.all([
            clientModDefault(itemId, "cli"),
            clientFnDefault(itemId, 9),
            clientAnonModDefault(itemId, "anon-cli"),
            helperNamedAction(itemId),
          ]);
          setClientImportsResult(`${r1}|${r2}|${r3}|${r4}`);
        }}
      >
        Run Client-Imported Default Actions
      </button>
      <p data-testid="client-imported-defaults-result">{clientImportsResult}</p>

      <button
        type="button"
        data-testid="btn-mixed-case-inline"
        onClick={async () => {
          const out = await serverInlineAction("closure-ok");
          setInlineResult(out);
        }}
      >
        Run Mixed-Case Route Inline Action
      </button>
      <p data-testid="mixed-case-inline-result">{inlineResult}</p>

      <button
        type="button"
        data-testid="btn-load-streamed-card"
        onClick={async () => {
          const card = await streamCard(itemId);
          setStreamedUi(card);
        }}
      >
        Load Streamed Card
      </button>
      <div data-testid="streamed-card-slot">{streamedUi}</div>
    </div>
  );
}

