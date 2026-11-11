import { Suspense } from "react";
import { getContext } from "dinou";

function isAlsStoreDefined(): boolean {
  const storage = (
    globalThis as unknown as Record<
      symbol,
      { getStore?: () => unknown } | undefined
    >
  )[Symbol.for("dinou.request.context.storage")];
  return Boolean(storage?.getStore?.() !== undefined);
}

async function NestedAsyncContextBadge({ tag }: { tag: string }) {
  await new Promise((resolve) => setTimeout(resolve, 35));
  const alsNested = isAlsStoreDefined();
  const ctxNested = getContext();
  const userNested = ctxNested?.req?.cookies?.["sf_sc_user"] ?? "MISSING_COOKIE";
  const pluginUserNested = ctxNested?.user?.name ?? "MISSING_PLUGIN_USER";

  return (
    <div id="sf-sc-nested-box" data-tag={tag}>
      <span id="sf-sc-nested-als">{alsNested ? "als-active" : "als-missing"}</span>
      <span id="sf-sc-nested-user">{userNested}</span>
      <span id="sf-sc-nested-plugin-user">{pluginUserNested}</span>
    </div>
  );
}

export default async function AsyncContextCard({
  tag,
  delayMs = 80,
}: {
  tag: string;
  delayMs?: number;
}) {
  const alsBefore = isAlsStoreDefined();
  const ctxBefore = getContext();
  const userBefore = ctxBefore?.req?.cookies?.["sf_sc_user"] ?? "MISSING_COOKIE";
  const rawPath = ctxBefore?.req?.headers?.["x-dinou-current-path"];
  const pathBefore =
    (Array.isArray(rawPath) ? rawPath[0] : rawPath) ?? "MISSING_PATH";

  await new Promise((resolve) => setTimeout(resolve, delayMs));

  const alsAfter = isAlsStoreDefined();
  const ctxAfter = getContext();
  const userAfter = ctxAfter?.req?.cookies?.["sf_sc_user"] ?? "MISSING_COOKIE";
  const uaAfter = ctxAfter?.req?.headers?.["user-agent"] ?? "MISSING_UA";
  const pluginUserAfter = ctxAfter?.user?.name ?? "MISSING_PLUGIN_USER";
  const isContextDefined = Boolean(
    ctxBefore &&
      ctxBefore.req &&
      ctxAfter &&
      ctxAfter.req &&
      typeof ctxAfter.req.headers === "object"
  );

  if (ctxAfter?.res) {
    ctxAfter.res.cookie("sf_sc_echo", `${tag}_${userAfter}`, {
      path: "/t-sf-server-comp-context",
    });
  }

  return (
    <div id="sf-sc-card" data-tag={tag}>
      <div id="sf-sc-tag">{tag}</div>
      <div id="sf-sc-context-defined">
        {isContextDefined ? "defined" : "undefined"}
      </div>
      <div id="sf-sc-als-status">
        {alsBefore && alsAfter ? "als-active" : "als-missing"}
      </div>
      <div id="sf-sc-ua">{uaAfter}</div>
      <div id="sf-sc-current-path">{pathBefore}</div>
      <div id="sf-sc-user-before">{userBefore}</div>
      <div id="sf-sc-user-after">{userAfter}</div>
      <div id="sf-sc-plugin-user">{pluginUserAfter}</div>
      <Suspense fallback={<div id="sf-sc-nested-loading">loading nested...</div>}>
        <NestedAsyncContextBadge tag={tag} />
      </Suspense>
    </div>
  );
}
