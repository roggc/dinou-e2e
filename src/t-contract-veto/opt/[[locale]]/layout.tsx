import type { ReactNode } from "react";

export default function ContractOptLocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { locale?: string };
}) {
  return (
    <div
      data-testid="contract-opt-locale-layout"
      data-locale={params.locale || "default"}
    >
      {children}
    </div>
  );
}
