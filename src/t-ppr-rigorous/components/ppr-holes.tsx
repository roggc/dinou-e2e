import { Suspense, memo } from "react";
import { getContext } from "dinou";
import HoleClientWidget from "./hole-client-widget";

// 1. Static Async Component inside <Suspense> (NO dynamic bailout!)
// Must resolve at build time into shell.html and NOT be re-streamed at runtime.
export async function StaticAsyncCard() {
  await new Promise((r) => setTimeout(r, 15));
  const staticComputedAt = new Date().toISOString();
  const staticHash = `static-suspense-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <div
      data-testid="static-suspense-resolved"
      className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-xs space-y-1"
    >
      <div className="font-semibold text-emerald-300">
        Caso 3: Static &lt;Suspense&gt; (No Dynamic Access)
      </div>
      <div className="font-mono text-emerald-200">
        staticHash: <span data-testid="static-suspense-hash">{staticHash}</span> | computedAt:{" "}
        <span data-testid="static-suspense-time">{staticComputedAt}</span>
      </div>
    </div>
  );
}

// 2. Dynamic Hole #1: Reads cookies AFTER a 35ms async delay
export async function DynamicCookieHole() {
  await new Promise((r) => setTimeout(r, 35));
  const ctx = getContext();
  const user = ctx?.req?.cookies?.ppr_user || "anonymous-guest";
  const session = ctx?.req?.cookies?.ppr_session || "no-session";
  const renderedAt = new Date().toISOString();

  return (
    <div
      data-testid="hole-cookies-resolved"
      className="p-3 rounded-lg bg-amber-950/50 border border-amber-500/40 text-xs space-y-1"
    >
      <div className="font-mono text-amber-100">
        cookie.ppr_user: <strong data-testid="hole-cookies-user">{user}</strong> |{" "}
        cookie.ppr_session: <strong data-testid="hole-cookies-session">{session}</strong>
      </div>
      <div className="font-mono text-slate-400">
        holeRenderedAt: <span data-testid="hole-cookies-time">{renderedAt}</span>
      </div>
    </div>
  );
}

// 3. Dynamic Hole #2: Reads query & headers AFTER a shorter 10ms async delay
export async function DynamicQueryHeaderHole() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const theme = String(ctx?.req?.query?.theme || "default-dark");
  const lang = String(ctx?.req?.query?.lang || "es");
  const probeHeader = String(ctx?.req?.headers?.["x-ppr-probe"] || "none");
  const hasUserAgent = Boolean(ctx?.req?.headers?.["user-agent"]);
  const renderedAt = new Date().toISOString();

  return (
    <div
      data-testid="hole-query-resolved"
      className="p-3 rounded-lg bg-cyan-950/50 border border-cyan-500/40 text-xs space-y-1"
    >
      <div className="font-mono text-cyan-100">
        query.theme: <strong data-testid="hole-query-theme">{theme}</strong> | query.lang:{" "}
        <strong data-testid="hole-query-lang">{lang}</strong> | x-ppr-probe:{" "}
        <strong data-testid="hole-header-probe">{probeHeader}</strong> | ua:{" "}
        <strong data-testid="hole-header-ua">{hasUserAgent ? "present" : "missing"}</strong>
      </div>
      <div className="font-mono text-slate-400">
        holeRenderedAt: <span data-testid="hole-query-time">{renderedAt}</span>
      </div>
    </div>
  );
}

// 4. Dynamic Hole #3: Server Component inside <Suspense> rendering a Client Component child
export async function DynamicWithClientChildHole() {
  await new Promise((r) => setTimeout(r, 12));
  const ctx = getContext();
  const tier = ctx?.req?.cookies?.ppr_tier || "free-tier";
  const plan = String(ctx?.req?.query?.plan || "starter");
  const requestStamp = `req-${Date.now()}`;

  return (
    <div
      data-testid="hole-with-client-resolved"
      className="p-3 rounded-lg bg-indigo-950/40 border border-indigo-500/40 text-xs space-y-1"
    >
      <HoleClientWidget
        serverTier={tier}
        serverPlan={plan}
        requestStamp={requestStamp}
      />
    </div>
  );
}

// 5A. Inner Dynamic Hole inside an Outer Static <Suspense>
async function InnerDynamicInStaticHole() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const nestedVal = String(ctx?.req?.query?.nested || "nested-default");
  const user = ctx?.req?.cookies?.ppr_user || "anonymous-guest";

  return (
    <div
      data-testid="inner-dynamic-in-static-resolved"
      className="mt-2 p-2 rounded bg-purple-900/40 border border-purple-400/40 font-mono text-purple-100"
    >
      Inner Dynamic Hole → query.nested:{" "}
      <strong data-testid="inner-dynamic-val">{nestedVal}</strong> | user:{" "}
      <strong data-testid="inner-dynamic-user">{user}</strong>
    </div>
  );
}

export async function OuterStaticWithInnerDynamicHole() {
  await new Promise((r) => setTimeout(r, 8));
  const outerStaticId = `outer-static-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <div
      data-testid="outer-static-wrapper"
      className="p-3 rounded-lg bg-purple-950/40 border border-purple-500/40 text-xs space-y-1"
    >
      <div className="font-mono text-slate-300">
        outerStaticId: <strong data-testid="outer-static-id">{outerStaticId}</strong>
      </div>
      <Suspense
        fallback={
          <div data-testid="inner-dynamic-fallback" className="text-purple-400">
            Loading inner dynamic hole...
          </div>
        }
      >
        <InnerDynamicInStaticHole />
      </Suspense>
    </div>
  );
}

// 5B. Outer Dynamic <Suspense> containing an Inner Dynamic <Suspense>
async function DeepInnerDynamicBadge() {
  await new Promise((r) => setTimeout(r, 8));
  const ctx = getContext();
  const deep = String(ctx?.req?.query?.deep || "deep-default");
  return (
    <span
      data-testid="deep-inner-dynamic-resolved"
      className="inline-block mt-1 px-2 py-0.5 rounded bg-pink-500/30 text-pink-100 font-mono"
    >
      deep=<strong data-testid="deep-inner-val">{deep}</strong>
    </span>
  );
}

export async function OuterDynamicWithInnerDynamicHole() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const outerUser = ctx?.req?.cookies?.ppr_user || "anonymous-guest";

  return (
    <div
      data-testid="outer-dynamic-resolved"
      className="p-3 rounded-lg bg-pink-950/40 border border-pink-500/40 text-xs space-y-1"
    >
      <div className="font-mono text-pink-100">
        outerCookieUser: <strong data-testid="outer-dynamic-user">{outerUser}</strong>
      </div>
      <Suspense
        fallback={
          <span data-testid="deep-inner-fallback" className="text-pink-400">
            Loading deep inner...
          </span>
        }
      >
        <DeepInnerDynamicBadge />
      </Suspense>
    </div>
  );
}

// 6. React.memo wrapping an async dynamic Server Component inside <Suspense>
export const MemoizedDynamicHole = memo(async function MemoizedDynamicHoleInner() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const memoParam = String(ctx?.req?.query?.memo || "memo-ok");
  const user = ctx?.req?.cookies?.ppr_user || "anonymous-guest";

  return (
    <div
      data-testid="hole-memo-resolved"
      className="p-3 rounded-lg bg-teal-950/40 border border-teal-500/40 text-xs space-y-1"
    >
      <div className="font-mono text-teal-100">
        memoParam: <strong data-testid="hole-memo-param">{memoParam}</strong> | user:{" "}
        <strong data-testid="hole-memo-user">{user}</strong>
      </div>
    </div>
  );
});

// 7. Special payload / error injection hole for security & edge-case testing
export async function EdgeCasePayloadHole() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const throwErr = ctx?.req?.query?.throw_err;
  if (throwErr) {
    throw new Error(`SimulatedHoleError: ${String(throwErr)}`);
  }
  const rawPayload = String(
    ctx?.req?.query?.payload || "Safe text </template><script>window.__PPR_XSS__=1</script>"
  );

  return (
    <div
      data-testid="hole-edge-resolved"
      className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-xs space-y-1"
    >
      <div className="font-mono text-rose-100 break-all">
        payload: <span data-testid="hole-edge-payload">{rawPayload}</span>
      </div>
    </div>
  );
}

