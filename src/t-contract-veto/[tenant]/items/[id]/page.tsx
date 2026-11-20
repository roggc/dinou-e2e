export default function TenantItemPage({
  params,
}: {
  params: { tenant: string; id: string };
}) {
  return (
    <main data-testid="tenant-item">
      {`Tenant:${params.tenant}:Item:${params.id}`}
    </main>
  );
}
