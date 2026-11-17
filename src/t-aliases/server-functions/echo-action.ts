"use server";

import { getContext } from "dinou/server";
import { ALIAS_EXACT_SETTINGS } from "@alias-exact-cfg";
import { formatAliasBanner } from "@alias-lib/format";
import { ESM_JS_TO_TS_MARKER } from "@alias-lib/esm-target.js";
import { SHARED_FALLBACK_ONLY } from "@alias-shared/shared-only";
import { SHARED_OVERRIDDEN_VALUE } from "@alias-shared/overridden";
import { formatTildeTag } from "~alias-helper";

export async function runAliasServerEcho(input: string) {
  const ctx = getContext() as Record<string, unknown>;
  return {
    echoed: formatAliasBanner(input),
    exactMode: ALIAS_EXACT_SETTINGS.mode,
    esmSubstitution: ESM_JS_TO_TS_MARKER,
    sharedFallback: SHARED_FALLBACK_ONLY,
    sharedOverride: SHARED_OVERRIDDEN_VALUE,
    tildeResult: formatTildeTag(input),
    configPluginProbe:
      typeof ctx?.aliasConfigProbe === "string"
        ? ctx.aliasConfigProbe
        : "missing",
  };
}

