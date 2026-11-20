export default function ContractOptAboutPage({
  params,
}: {
  params: { locale?: string };
}) {
  return (
    <main data-testid="contract-opt-about">
      {`OptAbout:${params.locale || "default"}`}
    </main>
  );
}
