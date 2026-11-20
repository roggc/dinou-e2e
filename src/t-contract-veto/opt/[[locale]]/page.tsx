export default function ContractOptIndexPage({
  params,
}: {
  params: { locale?: string };
}) {
  return (
    <main data-testid="contract-opt-index">
      {`OptIndex:${params.locale || "default"}`}
    </main>
  );
}
