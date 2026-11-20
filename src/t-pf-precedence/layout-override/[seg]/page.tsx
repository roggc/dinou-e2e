const HIT_KEY = Symbol.for("dinou.e2e.lf.prec.pageHits");

export default function PfPrecedenceOverrideLayoutPage({
  params,
}: {
  params: { seg: string };
}) {
  const hits = ((globalThis as any)[HIT_KEY] =
    ((globalThis as any)[HIT_KEY] || 0) + 1);
  return (
    <main data-testid="lf-prec-override-page">
      {`LfOverride:${params.seg}:hit:${hits}`}
    </main>
  );
}
