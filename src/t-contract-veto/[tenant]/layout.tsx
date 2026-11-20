import type { ReactNode } from "react";

export default function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { tenant: string };
}) {
  return (
    <section data-testid="tenant-shell" data-tenant={params.tenant}>
      {children}
    </section>
  );
}
