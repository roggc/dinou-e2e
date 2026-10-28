import type { ReactNode } from "react";
import ServerBadgeCard from "./components/server-badge-card";
import SfBodyClient from "./components/sf-body-client";
import {
  calculateOrderOnServer,
  verifyContextAndSign,
  inspectSfManifest,
  nonServerHelperFormat,
} from "./utils/mixed-server-utils";

export interface StatefulFormResult {
  submissions: number;
  lastDeveloper: string;
  lastFeature: string;
  capturedPageRenderId: string;
}

export interface ServerFormLogEntry {
  id: string;
  message: string;
  capturedSalt: string;
}

let serverFormLogs: ServerFormLogEntry[] = [
  {
    id: "init-1",
    message: "Initial server log ready",
    capturedSalt: "BOOT-SALT-001",
  },
];

/**
 * CASE 4: Top-Level function WITHOUT explicit `export` that declares `"use server"` in its body.
 * Dinou's `transformServerFunctions` detects the body directive and adds `export` automatically.
 */
async function autoExportedTopLevelAction(inputText: string) {
  "use server";

  const normalized = inputText.trim() || "test-dinou";
  return {
    original: normalized,
    reversed: normalized.split("").reverse().join(""),
    upper: normalized.toUpperCase(),
    length: normalized.length,
  };
}

export default async function SfBodyPage() {
  // Deterministic lexical closure variables for SSR/SSG/RSC consistency
  const pageRenderId = "RND-SF-902";
  const serverSecretToken = "SECRET-DINOU-902";
  const baseMultiplier = 7;

  // Normal non-server helper from mixed-server-utils.ts used during Server Component render
  const subtitleLabel = nonServerHelperFormat("Suite use server in body");

  /**
   * CASE 1: Basic inline function inside Server Component with "use server" in body
   */
  async function inlineCounterAction(baseValue: number, delta: number) {
    "use server";

    return {
      count: baseValue + delta,
      delta,
      executedOnServer: typeof window === "undefined",
    };
  }

  /**
   * CASE 2: Inline function with lexical closure capture (Closure Hoisting + .bind)
   * Captures `pageRenderId`, `serverSecretToken`, and `baseMultiplier` from SfBodyPage scope.
   */
  async function inlineClosureAction(clientNote: string, clientFactor: number) {
    "use server";

    const computedScore = baseMultiplier * clientFactor;
    return {
      capturedPageRenderId: pageRenderId,
      capturedSecretToken: serverSecretToken,
      capturedBaseMultiplier: baseMultiplier,
      clientFactor,
      computedScore,
      clientNote: clientNote.trim() || "No note",
    };
  }

  /**
   * CASE 3A: Inline function inside `.map()` capturing both the iterated item (`preset`)
   * and parent scope variable (`pageRenderId`).
   */
  const rawPresets = [
    { id: "turbo", label: "Turbo +10", bonus: 10 },
    { id: "hyper", label: "Hyper +25", bonus: 25 },
    { id: "quantum", label: "Quantum +50", bonus: 50 },
  ];

  const boundPresets = rawPresets.map((preset) => {
    async function applyPresetAction(triggeredBy: string) {
      "use server";

      return {
        presetId: preset.id,
        presetLabel: preset.label,
        bonusAdded: preset.bonus,
        newCounterValue: 100 + preset.bonus,
        capturedRenderId: pageRenderId,
        triggeredBy,
      };
    }

    return {
      id: preset.id,
      label: preset.label,
      bonus: preset.bonus,
      action: applyPresetAction,
    };
  });

  /**
   * CASE 6A: Inline function compatible with React 19 `useActionState(fn, initialState)`
   * Captures `pageRenderId` from the Server Component.
   */
  async function inlineStatefulFormAction(
    prevState: StatefulFormResult,
    formData: FormData
  ): Promise<StatefulFormResult> {
    "use server";

    const developer = ((formData.get("developer") as string) || "Anon").trim();
    const feature = ((formData.get("feature") as string) || "Inline").trim();
    const nextSubmissions = (prevState?.submissions || 0) + 1;

    return {
      submissions: nextSubmissions,
      lastDeveloper: developer,
      lastFeature: feature,
      capturedPageRenderId: pageRenderId,
    };
  }

  /**
   * CASE 6B: Inline function returning a Server Component (JSX) via Flight RPC
   * Captures `serverSecretToken` by closure.
   */
  async function inlineStreamRscAction(topic: string): Promise<ReactNode> {
    "use server";

    return (
      <ServerBadgeCard
        topic={topic || "React 19 Flight RSC"}
        capturedSecret={serverSecretToken}
        renderCount={1}
      />
    );
  }

  /**
   * Helper to query the logs recorded by the inline JSX form action (Case 3B)
   */
  async function getServerFormLogs(): Promise<ServerFormLogEntry[]> {
    "use server";
    return [...serverFormLogs];
  }

  /**
   * CASE 3B: Form rendered in the Server Component with an inline Arrow Function
   * directly inside the JSX attribute `action={async (formData) => { "use server"; ... }}`
   */
  const serverFormSlot = (
    <div id="server-form-slot">
      <form
        action={async (formData: FormData) => {
          "use server";

          const msg =
            ((formData.get("inline_jsx_msg") as string) || "").trim() ||
            "Default JSX Action Msg";
          const entry: ServerFormLogEntry = {
            id: "log-" + Date.now(),
            message: msg,
            capturedSalt: pageRenderId,
          };
          serverFormLogs = [entry, ...serverFormLogs.slice(0, 40)];
        }}
      >
        <input
          id="input-jsx-form"
          type="text"
          name="inline_jsx_msg"
          defaultValue="JSX-Inline-Test"
        />
        <button id="btn-jsx-form-submit" type="submit">
          Submit JSX Action
        </button>
      </form>
    </div>
  );

  return (
    <main style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1 id="sf-body-title">Server Functions Body Directive E2E</h1>
      <p id="sf-body-subtitle">{subtitleLabel}</p>

      <SfBodyClient
        initialCounter={100}
        serverRenderInfo={{
          pageRenderId,
          serverSecretToken,
          baseMultiplier,
        }}
        serverFormSlot={serverFormSlot}
        inlineCounterAction={inlineCounterAction}
        inlineClosureAction={inlineClosureAction}
        boundPresets={boundPresets}
        autoExportedTopLevelAction={autoExportedTopLevelAction}
        calculateOrderOnServer={calculateOrderOnServer}
        verifyContextAndSign={verifyContextAndSign}
        inspectSfManifest={inspectSfManifest}
        inlineStatefulFormAction={inlineStatefulFormAction}
        inlineStreamRscAction={inlineStreamRscAction}
        getServerFormLogs={getServerFormLogs}
      />
    </main>
  );
}

