import type { ReactNode } from "react";

const SPY_REV_KEY = Symbol.for("dinou.e2e.lf.prec.defaultRevCalls");
const SPY_ISG_KEY = Symbol.for("dinou.e2e.lf.prec.defaultIsgCalls");
const LAYOUT_HIT_KEY = Symbol.for("dinou.e2e.lf.prec.layoutHits");

export default function PfPrecedenceOverrideLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { seg: string };
}) {
  const layoutHits = ((globalThis as any)[LAYOUT_HIT_KEY] =
    ((globalThis as any)[LAYOUT_HIT_KEY] || 0) + 1);
  const revSpy = (globalThis as any)[SPY_REV_KEY] || 0;
  const isgSpy = (globalThis as any)[SPY_ISG_KEY] || 0;
  return (
    <section
      data-testid="lf-prec-override-layout"
      data-seg={params.seg}
      data-layout-hit={layoutHits}
      data-spies={`${revSpy}:${isgSpy}`}
    >
      {children}
    </section>
  );
}
