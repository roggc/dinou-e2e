import { getContext } from "./dinou";
import { ALIAS_EXACT_SETTINGS } from "@alias-exact-cfg";
import { formatAliasBanner } from "@alias-lib/format";

export function getStaticPaths() {
  return ["ssg-prebuilt"];
}

export async function getProps(params: { slug: string }) {
  const ctx = getContext() as Record<string, unknown>;
  const slug = params?.slug ?? "unknown";
  return {
    slugFromPageFn: slug,
    formattedSlug: formatAliasBanner(slug),
    exactVersion: ALIAS_EXACT_SETTINGS.version,
    pluginProbeFromGetProps:
      typeof ctx?.aliasConfigProbe === "string"
        ? ctx.aliasConfigProbe
        : "ssg_no_request_plugin",
  };
}
