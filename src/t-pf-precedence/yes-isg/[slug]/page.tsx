const SPY_KEY = Symbol.for("dinou.e2e.pf.prec.yesIsg.defaultCalls");

export default function PfPrecedenceYesIsgPage({
  params,
}: {
  params: { slug: string };
}) {
  const spyCalls = (globalThis as any)[SPY_KEY] || 0;
  return (
    <main data-testid="pf-prec-yes-isg">
      {`YesIsg:${params.slug}|spy:${spyCalls}`}
    </main>
  );
}
