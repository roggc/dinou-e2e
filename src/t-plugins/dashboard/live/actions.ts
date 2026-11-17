"use server";

import { getContext } from "dinou/server";

export async function inspectPluginServerActionRpc(label: string) {
  const ctx = getContext() as Record<string, unknown>;
  const g = globalThis as Record<string, unknown>;
  return {
    label,
    pluginsSuiteVersion: String(ctx?.pluginsSuiteVersion ?? "missing"),
    setupLog: Array.isArray(g.__E2E_PLUGINS_SETUP_LOG__)
      ? g.__E2E_PLUGINS_SETUP_LOG__
      : [],
    userSetupTag: String(g.__E2E_USER_SETUP_TAG__ ?? "missing"),
  };
}

