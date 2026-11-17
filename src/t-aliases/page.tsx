import { Link } from "./dinou";
import { ShellBox } from "@alias-ui/ShellBox";
import { STAR_BADGE_SOURCE } from "@alias-ui/icons/StarBadge";
import { ALIAS_EXACT_SETTINGS } from "@alias-exact-cfg";
import { formatTildeTag } from "~alias-helper";
import { formatAliasBanner } from "@alias-lib/format";
import { ESM_JS_TO_TS_MARKER } from "@alias-lib/esm-target.js";
import aliasMeta from "@alias-lib/meta.json";
import { SHARED_OVERRIDDEN_VALUE } from "@alias-shared/overridden";
import { SHARED_FALLBACK_ONLY } from "@alias-shared/shared-only";
import { HOT_ALIAS_MARKER } from "@alias-hot/HotBanner";
import badgeLogoUrl from "@alias-assets/badge-logo.svg";
import sparkleSvgUrl from "@alias-svg/sparkle.svg";
import { AliasInteractiveCard } from "@alias-components/AliasInteractiveCard";

export default function AliasesIndexPage() {
  return (
    <main
      data-testid="t-aliases-ssg-page"
      data-rsc-star-source={STAR_BADGE_SOURCE}
      data-rsc-exact={ALIAS_EXACT_SETTINGS.mode}
      data-rsc-tilde={formatTildeTag("ssg")}
      data-rsc-format={formatAliasBanner("ssg")}
      data-rsc-esm={ESM_JS_TO_TS_MARKER}
      data-rsc-json={aliasMeta.engine}
      data-rsc-shared-override={SHARED_OVERRIDDEN_VALUE}
      data-rsc-shared-fallback={SHARED_FALLBACK_ONLY}
      data-rsc-hot-marker={HOT_ALIAS_MARKER}
      data-rsc-badge-asset={badgeLogoUrl}
      data-rsc-sparkle-asset={sparkleSvgUrl}
    >
      <ShellBox title="Dinou Unified Path Aliases (SSG)">
        <p data-testid="t-aliases-rsc-summary">
          {formatAliasBanner("rsc-index")} | {STAR_BADGE_SOURCE}
        </p>
        <AliasInteractiveCard
          routeLabel="ssg-index"
          buttonId="ssg-alias-rpc-btn"
          resultId="ssg-alias-rpc-result"
        />
        <nav>
          <Link to="/t-aliases/ssg-prebuilt" data-testid="t-aliases-ssg-slug-link">
            Go to SSG Prebuilt Alias Route
          </Link>
        </nav>
      </ShellBox>
    </main>
  );
}

