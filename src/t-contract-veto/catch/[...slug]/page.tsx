export default function ContractCatchPage({
  params,
}: {
  params: { slug: string[] };
}) {
  return (
    <main data-testid="contract-catch-page">
      {`Catch:${params.slug.join("/")}`}
    </main>
  );
}
