import type { LayoutProps } from "./dinou";
import type { TenantLayoutExtraProps } from "./layout_functions";

export default function ApiRefNavTenantLayout({
  children,
  tenant,
}: LayoutProps<TenantLayoutExtraProps>) {
  return (
    <section
      data-testid="api-nav-tenant-layout"
      data-tenant={tenant.title}
    >
      {children}
    </section>
  );
}
