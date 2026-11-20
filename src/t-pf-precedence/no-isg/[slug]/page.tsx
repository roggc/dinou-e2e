const SPY_KEY = Symbol.for("dinou.e2e.pf.prec.noIsg.defaultCalls");

export default function PfPrecedenceNoIsgPage({
  params,
}: {
  params: { slug: string };
}) {
  const spyCalls = (globalThis as any)[SPY_KEY] || 0;
  return (
    <main data-testid="pf-prec-no-isg">
      {`NoIsg:${params.slug}|spy:${spyCalls}`}
    </main>
  );
}
