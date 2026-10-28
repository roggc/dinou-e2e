"use client";

import { useState, useActionState, type ReactNode } from "react";
import type { StatefulFormResult, ServerFormLogEntry } from "../page";
import {
  directClientImportedServerFn,
  directClientArrowServerFn,
  type OrderCalculationResult,
} from "../utils/mixed-server-utils";

interface BoundPresetItem {
  id: string;
  label: string;
  bonus: number;
  action: (triggeredBy: string) => Promise<{
    presetId: string;
    presetLabel: string;
    bonusAdded: number;
    newCounterValue: number;
    capturedRenderId: string;
    triggeredBy: string;
  }>;
}

interface ManifestInspection {
  sfBodyEntries: Record<string, string[]>;
  mixedExports: string[];
  treeShakingVerified: boolean;
}

export interface SfBodyClientProps {
  initialCounter: number;
  serverRenderInfo: {
    pageRenderId: string;
    serverSecretToken: string;
    baseMultiplier: number;
  };
  serverFormSlot: ReactNode;
  inlineCounterAction: (
    baseValue: number,
    delta: number
  ) => Promise<{
    count: number;
    delta: number;
    executedOnServer: boolean;
  }>;
  inlineClosureAction: (
    clientNote: string,
    clientFactor: number
  ) => Promise<{
    capturedPageRenderId: string;
    capturedSecretToken: string;
    capturedBaseMultiplier: number;
    clientFactor: number;
    computedScore: number;
    clientNote: string;
  }>;
  boundPresets: BoundPresetItem[];
  autoExportedTopLevelAction: (inputText: string) => Promise<{
    original: string;
    reversed: string;
    upper: string;
    length: number;
  }>;
  calculateOrderOnServer: (
    baseAmount: number,
    couponCode: string
  ) => Promise<OrderCalculationResult>;
  verifyContextAndSign: (
    payload: string,
    customTag: string
  ) => Promise<{
    payload: string;
    customTag: string;
    previousCookie: string;
    newCookieSet: string;
    hasUserAgent: boolean;
    executedOnServer: boolean;
  }>;
  inspectSfManifest: () => Promise<ManifestInspection>;
  inlineStatefulFormAction: (
    prevState: StatefulFormResult,
    formData: FormData
  ) => Promise<StatefulFormResult>;
  inlineStreamRscAction: (topic: string) => Promise<ReactNode>;
  getServerFormLogs: () => Promise<ServerFormLogEntry[]>;
}

export default function SfBodyClient({
  initialCounter,
  serverRenderInfo,
  serverFormSlot,
  inlineCounterAction,
  inlineClosureAction,
  boundPresets,
  autoExportedTopLevelAction,
  calculateOrderOnServer,
  verifyContextAndSign,
  inspectSfManifest,
  inlineStatefulFormAction,
  inlineStreamRscAction,
  getServerFormLogs,
}: SfBodyClientProps) {
  const [counterResult, setCounterResult] = useState("");
  const [closureResult, setClosureResult] = useState("");
  const [presetResult, setPresetResult] = useState("");
  const [jsxFormLogsResult, setJsxFormLogsResult] = useState("");
  const [autoExportResult, setAutoExportResult] = useState("");
  const [mixedOrderResult, setMixedOrderResult] = useState("");
  const [mixedContextResult, setMixedContextResult] = useState("");
  const [manifestResult, setManifestResult] = useState("");
  const [streamedNode, setStreamedNode] = useState<ReactNode>(null);
  const [directClientFnResult, setDirectClientFnResult] = useState("");
  const [directClientArrowResult, setDirectClientArrowResult] = useState("");

  const [actionState, formAction] = useActionState(inlineStatefulFormAction, {
    submissions: 0,
    lastDeveloper: "-",
    lastFeature: "-",
    capturedPageRenderId: serverRenderInfo.pageRenderId,
  });

  return (
    <div>
      {/* Case 1: Basic Inline Server Function */}
      <section style={{ marginBottom: "12px" }}>
        <button
          id="btn-inline-counter"
          onClick={async () => {
            const res = await inlineCounterAction(initialCounter, 5);
            setCounterResult(
              `count:${res.count}:delta:${res.delta}:server:${res.executedOnServer}`
            );
          }}
        >
          Run Inline Counter
        </button>
        <span id="result-inline-counter">{counterResult}</span>
      </section>

      {/* Case 2: Inline Server Function with Closure Hoisting (.bind) */}
      <section style={{ marginBottom: "12px" }}>
        <button
          id="btn-inline-closure"
          onClick={async () => {
            const res = await inlineClosureAction("ClientNote", 8);
            setClosureResult(
              `${res.capturedPageRenderId}|${res.capturedSecretToken}|${res.computedScore}|${res.clientNote}`
            );
          }}
        >
          Run Inline Closure
        </button>
        <span id="result-inline-closure">{closureResult}</span>
      </section>

      {/* Case 3A: Loop .map() Inline Server Functions */}
      <section style={{ marginBottom: "12px" }}>
        {boundPresets.map((p) => (
          <button
            key={p.id}
            id={`btn-preset-${p.id}`}
            onClick={async () => {
              const res = await p.action("PresetRunner");
              setPresetResult(
                `${res.presetId}|${res.presetLabel}|${res.bonusAdded}|${res.newCounterValue}|${res.capturedRenderId}|${res.triggeredBy}`
              );
            }}
          >
            {p.label}
          </button>
        ))}
        <span id="result-preset">{presetResult}</span>
      </section>

      {/* Case 3B: Server Component <form action={async (formData) => { "use server"; ... }}> */}
      <section style={{ marginBottom: "12px" }}>
        {serverFormSlot}
        <button
          id="btn-refresh-logs"
          onClick={async () => {
            const logs = await getServerFormLogs();
            const latest = logs[0];
            setJsxFormLogsResult(
              latest ? `${latest.message}|${latest.capturedSalt}` : "empty"
            );
          }}
        >
          Refresh Server Form Logs
        </button>
        <span id="result-jsx-form-logs">{jsxFormLogsResult}</span>
      </section>

      {/* Case 4: Top-Level Function without explicit export */}
      <section style={{ marginBottom: "12px" }}>
        <button
          id="btn-auto-export"
          onClick={async () => {
            const res = await autoExportedTopLevelAction("dinou-inline");
            setAutoExportResult(`${res.reversed}|${res.upper}|${res.length}`);
          }}
        >
          Run Auto-Exported Top-Level
        </button>
        <span id="result-auto-export">{autoExportResult}</span>
      </section>

      {/* Case 5: Mixed Server Utils (calculateOrderOnServer & verifyContextAndSign) */}
      <section style={{ marginBottom: "12px" }}>
        <button
          id="btn-mixed-order"
          onClick={async () => {
            const res = await calculateOrderOnServer(200, "DINOU9");
            setMixedOrderResult(
              `${res.baseAmount}|${res.discountApplied}|${res.taxAmount}|${res.finalTotal}|${res.couponUsed}|${res.executedOnServer}`
            );
          }}
        >
          Run Mixed Order
        </button>
        <span id="result-mixed-order">{mixedOrderResult}</span>

        <button
          id="btn-mixed-context"
          onClick={async () => {
            const res = await verifyContextAndSign("ctx-payload", "cookie-v902");
            setMixedContextResult(
              `${res.payload}|${res.customTag}|prev:${res.previousCookie}|set:${res.newCookieSet}|ua:${res.hasUserAgent}|server:${res.executedOnServer}`
            );
          }}
        >
          Run Mixed Context
        </button>
        <span id="result-mixed-context">{mixedContextResult}</span>
      </section>

      {/* Case 6: Granular Manifest Tree-Shaking Inspection */}
      <section style={{ marginBottom: "12px" }}>
        <button
          id="btn-inspect-manifest"
          onClick={async () => {
            const res = await inspectSfManifest();
            setManifestResult(
              `verified:${res.treeShakingVerified}|exports:${res.mixedExports.sort().join(",")}`
            );
          }}
        >
          Inspect Manifest
        </button>
        <span id="result-manifest-treeshaking">{manifestResult}</span>
      </section>

      {/* Case 6A: React 19 useActionState with Inline Server Function */}
      <section style={{ marginBottom: "12px" }}>
        <form action={formAction}>
          <input
            id="input-action-dev"
            name="developer"
            defaultValue="Ada"
          />
          <input
            id="input-action-feat"
            name="feature"
            defaultValue="ClosureAction"
          />
          <button id="btn-action-state-submit" type="submit">
            Submit ActionState Form
          </button>
        </form>
        <span id="result-action-state">
          {`${actionState.submissions}|${actionState.lastDeveloper}|${actionState.lastFeature}|${actionState.capturedPageRenderId}`}
        </span>
      </section>

      {/* Case 6B: Inline Server Function Streaming RSC JSX */}
      <section style={{ marginBottom: "12px" }}>
        <button
          id="btn-stream-rsc"
          onClick={async () => {
            const node = await inlineStreamRscAction("Flight-RSC-Topic");
            setStreamedNode(node);
          }}
        >
          Stream RSC Badge
        </button>
        <div id="streamed-rsc-container">{streamedNode}</div>
      </section>

      {/* Case 7 (Point 1): Direct Import in "use client" of Functions with "use server" in Body */}
      <section style={{ marginBottom: "12px" }}>
        <button
          id="btn-direct-client-fn"
          onClick={async () => {
            const res = await directClientImportedServerFn("DirectProbe");
            setDirectClientFnResult(
              `${res.probeLabel}|server:${res.executedOnServer}|ctx:${res.hasServerContext}|discount:${res.internalDiscount}|${res.environment}`
            );
          }}
        >
          Call Direct Client Imported Fn
        </button>
        <span id="result-direct-client-fn">{directClientFnResult}</span>

        <button
          id="btn-direct-client-arrow"
          onClick={async () => {
            const res = await directClientArrowServerFn(50);
            setDirectClientArrowResult(
              `${res.inputNumber}|bonus:${res.bonus}|total:${res.totalWithBonus}|server:${res.executedOnServer}`
            );
          }}
        >
          Call Direct Client Imported Arrow Fn
        </button>
        <span id="result-direct-client-arrow">{directClientArrowResult}</span>
      </section>
    </div>
  );
}

