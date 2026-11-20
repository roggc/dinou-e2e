export default function PfPrecedenceDefaultFnPage({
  params,
}: {
  params: { slug: string };
}) {
  return (
    <main data-testid="pf-prec-default-fn">{`DefaultFn:${params.slug}`}</main>
  );
}
