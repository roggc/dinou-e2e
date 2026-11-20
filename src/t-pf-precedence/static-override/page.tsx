const SPY_KEY = Symbol.for("dinou.e2e.pf.prec.static.defaultCalls");
const HIT_KEY = Symbol.for("dinou.e2e.pf.prec.static.hits");

export default function PfPrecedenceStaticOverridePage() {
  const hits = ((globalThis as any)[HIT_KEY] =
    ((globalThis as any)[HIT_KEY] || 0) + 1);
  const spyCalls = (globalThis as any)[SPY_KEY] || 0;
  return (
    <main data-testid="pf-prec-static">
      <div data-testid="pf-prec-static-hit">{`static-hit:${hits}`}</div>
      <div data-testid="pf-prec-static-spy">{`spy:${spyCalls}`}</div>
    </main>
  );
}
