import { Suspense } from "react";
import {
  StaticAsyncCard,
  DynamicCookieHole,
  DynamicQueryHeaderHole,
  DynamicWithClientChildHole,
  OuterStaticWithInnerDynamicHole,
  OuterDynamicWithInnerDynamicHole,
  MemoizedDynamicHole,
  EdgeCasePayloadHole,
} from "./components/ppr-holes";

export default function PprRigorousPage({
  shellBuildTime = "dev-mode",
  shellBuildId = "dev-shell",
  staticBanner = "Partial Prerendering (PPR) Rigorous Suite",
}: {
  shellBuildTime?: string;
  shellBuildId?: string;
  staticBanner?: string;
}) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <header
          data-testid="ppr-static-shell"
          className="p-5 rounded-2xl bg-slate-900 border border-emerald-500/40 shadow-xl space-y-2"
        >
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            Dinou PPR Rigorous E2E Suite (<code>/t-ppr-rigorous</code>)
          </h1>
          <p data-testid="ppr-static-banner" className="text-xs text-slate-300">
            {staticBanner}
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs font-mono text-emerald-200">
            <div>
              shellBuildId:{" "}
              <strong data-testid="shell-build-id" className="text-white">
                {shellBuildId}
              </strong>
            </div>
            <div>
              shellBuildTime:{" "}
              <strong data-testid="shell-build-time" className="text-white">
                {shellBuildTime}
              </strong>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 1. Static <Suspense> placed BEFORE Dynamic <Suspense> */}
          <Suspense
            fallback={
              <div data-testid="static-suspense-fallback">
                Loading Static Async Card...
              </div>
            }
          >
            <StaticAsyncCard />
          </Suspense>

          {/* 2. Dynamic Cookie Hole (35ms async delay before cookies access) */}
          <Suspense
            fallback={
              <div data-testid="hole-cookies-fallback">
                [PPR Fallback #1] Postponed Cookie Hole...
              </div>
            }
          >
            <DynamicCookieHole />
          </Suspense>

          {/* 3. Dynamic Query & Headers Hole (10ms async delay) */}
          <Suspense
            fallback={
              <div data-testid="hole-query-fallback">
                [PPR Fallback #2] Postponed Query &amp; Headers Hole...
              </div>
            }
          >
            <DynamicQueryHeaderHole />
          </Suspense>

          {/* 4. Dynamic Hole Rendering an Interactive "use client" Child */}
          <Suspense
            fallback={
              <div data-testid="hole-with-client-fallback">
                [PPR Fallback #3] Postponed Server + Client Widget Hole...
              </div>
            }
          >
            <DynamicWithClientChildHole />
          </Suspense>

          {/* 5. Outer Static <Suspense> with Inner Dynamic <Suspense> */}
          <Suspense
            fallback={
              <div data-testid="outer-static-fallback">
                Loading Outer Static Suspense...
              </div>
            }
          >
            <OuterStaticWithInnerDynamicHole />
          </Suspense>

          {/* 6. Outer Dynamic <Suspense> with Nested Inner Dynamic <Suspense> */}
          <Suspense
            fallback={
              <div data-testid="outer-dynamic-fallback">
                [PPR Fallback #5] Postponed Outer + Inner Dynamic Hole...
              </div>
            }
          >
            <OuterDynamicWithInnerDynamicHole />
          </Suspense>

          {/* 7. React.memo Dynamic Server Component inside <Suspense> */}
          <Suspense
            fallback={
              <div data-testid="hole-memo-fallback">
                [PPR Fallback #6] Postponed React.memo Hole...
              </div>
            }
          >
            <MemoizedDynamicHole />
          </Suspense>

          {/* 8. Edge Case Payload (</template>) & Error Boundary Hole */}
          <Suspense
            fallback={
              <div data-testid="hole-edge-fallback">
                [PPR Fallback #7] Postponed Edge-Case / Security Payload Hole...
              </div>
            }
          >
            <EdgeCasePayloadHole />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

