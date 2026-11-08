import { Suspense } from "react";
import { getContext, noDynamic } from "dinou";
import { incrementRenderCount } from "../ppr-tracker";

async function OptInPageStaticNoDynamicChild() {
  noDynamic();
  await new Promise((r) => setTimeout(r, 10));
  const count = incrementRenderCount("opt-in-page-nodynamic");
  return (
    <div
      data-testid="opt-in-page-nodynamic-resolved"
      data-render-count={String(count)}
    >
      Opt-In Page (ppr=true) Static noDynamic() Child! Render #{count}
    </div>
  );
}

async function OptInPageDynamicHoleChild() {
  await new Promise((r) => setTimeout(r, 20));
  const count = incrementRenderCount("opt-in-page-dynamic-hole");
  const ctx = getContext();
  const user = ctx?.req?.cookies?.optin_user ?? "anon";
  const tag = ctx?.req?.query?.tag ?? "none";
  return (
    <div
      data-testid="opt-in-page-dynamic-resolved"
      data-render-count={String(count)}
      data-user={String(user)}
      data-tag={String(tag)}
    >
      Opt-In Page (ppr=true) Dynamic Hole Resolved! Render #{count} | user={String(user)} | tag={String(tag)}
    </div>
  );
}

export default async function OptInPprRoutePage() {
  await new Promise((r) => setTimeout(r, 10));
  const count = incrementRenderCount("opt-in-route-page");
  return (
    <div data-testid="opt-in-route-page" data-render-count={String(count)}>
      <h1 data-testid="opt-in-page-shell-resolved">
        Opt-In Route (ppr = true inside ppr = false Layout) Static Page Shell! Render #{count}
      </h1>
      <Suspense
        fallback={
          <div data-testid="opt-in-page-nodynamic-fallback">
            Loading Opt-In Page Static noDynamic...
          </div>
        }
      >
        <OptInPageStaticNoDynamicChild />
      </Suspense>
      <Suspense
        fallback={
          <div data-testid="opt-in-page-dynamic-fallback">
            Loading Opt-In Page Dynamic Hole...
          </div>
        }
      >
        <OptInPageDynamicHoleChild />
      </Suspense>
    </div>
  );
}

