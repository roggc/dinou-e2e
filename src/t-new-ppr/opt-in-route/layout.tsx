import { Suspense, type ReactNode } from "react";
import { incrementRenderCount } from "../ppr-tracker";

async function OptInLayoutStaticSuspenseChild() {
  await new Promise((r) => setTimeout(r, 15));
  const count = incrementRenderCount("opt-in-layout-suspense-child");
  return (
    <div
      data-testid="opt-in-layout-suspense-resolved"
      data-render-count={String(count)}
    >
      Opt-In Route Inner Layout (ppr=false) &lt;Suspense&gt; Child Resolved Statically Without noDynamic()! Render #{count}
    </div>
  );
}

export default async function OptInRouteLayout({ children }: { children: ReactNode }) {
  await new Promise((r) => setTimeout(r, 10));
  const count = incrementRenderCount("opt-in-layout-root");
  return (
    <div
      data-testid="opt-in-layout-root"
      data-render-count={String(count)}
      className="p-4 rounded-lg border border-teal-500/40 space-y-3"
    >
      <div data-testid="opt-in-layout-await-resolved">
        Inner Layout (ppr = false) Await Resolved Statically! Render #{count}
      </div>
      <Suspense
        fallback={
          <div data-testid="opt-in-layout-suspense-fallback">
            Loading Inner Layout Suspense...
          </div>
        }
      >
        <OptInLayoutStaticSuspenseChild />
      </Suspense>
      <div data-testid="opt-in-layout-children">{children}</div>
    </div>
  );
}

