import type { ReactNode } from "react";

export default function Z1SoakItemLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { id: string };
}) {
  const id = String(params?.id ?? "0");
  return (
    <section data-testid="z1-item-layout" data-layout-id={id}>
      <header data-testid="z1-layout-header">{`Z1 Layout ${id}`}</header>
      {children}
    </section>
  );
}
