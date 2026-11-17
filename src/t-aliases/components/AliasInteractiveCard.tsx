"use client";

import { useEffect, useState } from "react";
import panelStyles from "@alias-styles/panel.module.css";
import { StarBadge, STAR_BADGE_SOURCE } from "@alias-ui/icons/StarBadge";
import { runAliasServerEcho } from "@alias-server/echo-action";
import badgeLogoUrl from "@alias-assets/badge-logo.svg";
import sparkleSvgUrl from "@alias-svg/sparkle.svg";
import { ALIAS_EXACT_SETTINGS } from "@alias-exact-cfg";
import { formatTildeTag } from "~alias-helper";
import { formatAliasBanner } from "@alias-lib/format";
import { ESM_JS_TO_TS_MARKER } from "@alias-lib/esm-target.js";
import aliasMeta from "@alias-lib/meta.json";
import { SHARED_OVERRIDDEN_VALUE } from "@alias-shared/overridden";
import { SHARED_FALLBACK_ONLY } from "@alias-shared/shared-only";
import { HotBanner, HOT_ALIAS_MARKER } from "@alias-hot/HotBanner";

export function AliasInteractiveCard({
  routeLabel,
  buttonId,
  resultId,
}: {
  routeLabel: string;
  buttonId: string;
  resultId: string;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [rpcOutput, setRpcOutput] = useState("idle");

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <div
      data-testid="alias-client-card"
      className={panelStyles.card}
      data-client-hydrated={String(hydrated)}
      data-client-star-source={STAR_BADGE_SOURCE}
      data-client-exact={ALIAS_EXACT_SETTINGS.mode}
      data-client-tilde={formatTildeTag(routeLabel)}
      data-client-format={formatAliasBanner(routeLabel)}
      data-client-esm={ESM_JS_TO_TS_MARKER}
      data-client-json={aliasMeta.engine}
      data-client-shared-override={SHARED_OVERRIDDEN_VALUE}
      data-client-shared-fallback={SHARED_FALLBACK_ONLY}
      data-client-hot-marker={HOT_ALIAS_MARKER}
      data-client-badge-asset={badgeLogoUrl}
      data-client-sparkle-asset={sparkleSvgUrl}
      data-client-module-class={panelStyles.card || ""}
    >
      <div className={panelStyles.badge}>
        <StarBadge />
      </div>
      <HotBanner />
      <img
        data-testid="alias-client-badge-img"
        src={badgeLogoUrl}
        alt="Alias Badge Logo"
        width={24}
        height={24}
      />
      <img
        data-testid="alias-client-sparkle-img"
        src={sparkleSvgUrl}
        alt="Alias Suffix Sparkle"
        width={20}
        height={20}
      />
      <button
        id={buttonId}
        type="button"
        onClick={async () => {
          const res = await runAliasServerEcho(routeLabel);
          setRpcOutput(JSON.stringify(res));
        }}
      >
        Verify Alias Server Action
      </button>
      <pre id={resultId} data-testid="alias-rpc-result">
        {rpcOutput}
      </pre>
    </div>
  );
}

