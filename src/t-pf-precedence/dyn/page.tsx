const SPY_KEY = Symbol.for("dinou.e2e.pf.prec.dyn.defaultCalls");
const HIT_KEY = Symbol.for("dinou.e2e.pf.prec.dyn.hits");

export default function PfPrecedenceDynPage() {
  const hits = ((globalThis as any)[HIT_KEY] =
    ((globalThis as any)[HIT_KEY] || 0) + 1);
  const spyCalls = (globalThis as any)[SPY_KEY] || 0;
  return (
    <main data-testid="pf-prec-dyn">
      <div data-testid="pf-prec-dyn-hit">{`hit:${hits}`}</div>
      <div data-testid="pf-prec-dyn-spy">{`spy:${spyCalls}`}</div>
    </main>
  );
}
