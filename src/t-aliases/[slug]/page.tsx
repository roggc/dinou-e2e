import { getContext, type PageProps } from "./dinou";
import type { getProps } from "./page_functions";
import { ShellBox } from "@alias-ui/ShellBox";
import { STAR_BADGE_SOURCE } from "@alias-ui/icons/StarBadge";
import { ALIAS_EXACT_SETTINGS } from "@alias-exact-cfg";
import { formatTildeTag } from "~alias-helper";
import { formatAliasBanner } from "@alias-lib/format";
import { ESM_JS_TO_TS_MARKER } from "@alias-lib/esm-target.js";
import { SHARED_OVERRIDDEN_VALUE } from "@alias-shared/overridden";
import { SHARED_FALLBACK_ONLY } from "@alias-shared/shared-only";
import { HOT_ALIAS_MARKER } from "@alias-hot/HotBanner";
import badgeLogoUrl from "@alias-assets/badge-logo.svg";
import sparkleSvgUrl from "@alias-svg/sparkle.svg";
import { AliasInteractiveCard } from "@alias-components/AliasInteractiveCard";

export default function AliasesSlugPage(
  props: PageProps & Partial<Awaited<ReturnType<typeof getProps>>>
) {
  const ctx = getContext() as Record<string, unknown>;
  const activeSlug = props.slugFromPageFn || props.params.slug;
  const livePluginProbe =
    typeof ctx?.aliasConfigProbe === "string"
      ? ctx.aliasConfigProbe
      : (props.pluginProbeFromGetProps ?? "missing");

  return (
    <main
      data-testid="t-aliases-slug-page"
      data-slug={activeSlug}
      data-formatted-slug={props.formattedSlug ?? formatAliasBanner(activeSlug)}
      data-exact-version={props.exactVersion ?? ALIAS_EXACT_SETTINGS.version}
      data-plugin-probe={livePluginProbe}
      data-rsc-star-source={STAR_BADGE_SOURCE}
      data-rsc-exact={ALIAS_EXACT_SETTINGS.mode}
      data-rsc-tilde={formatTildeTag(activeSlug)}
      data-rsc-format={formatAliasBanner(activeSlug)}
      data-rsc-esm={ESM_JS_TO_TS_MARKER}
      data-rsc-shared-override={SHARED_OVERRIDDEN_VALUE}
      data-rsc-shared-fallback={SHARED_FALLBACK_ONLY}
      data-rsc-hot-marker={HOT_ALIAS_MARKER}
      data-rsc-badge-asset={badgeLogoUrl}
      data-rsc-sparkle-asset={sparkleSvgUrl}
    >
      <ShellBox title={`Alias Slug: ${activeSlug}`}>
        <AliasInteractiveCard
          routeLabel={activeSlug}
          buttonId="dyn-alias-rpc-btn"
          resultId="dyn-alias-rpc-result"
        />
      </ShellBox>
    </main>
  );
}
